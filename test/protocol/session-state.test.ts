import { describe, expect, it } from "bun:test"

import { type SessionEvent } from "../../src/protocol/session-event.ts"
import {
  applySessionEvent,
  commandCandidates,
  commandSuggestions,
  currentExpression,
  INITIAL_SESSION_STATE,
  mainViewEntries,
  type SessionState,
} from "../../src/protocol/session-state.ts"

// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。
// 時刻に依らないテストでは `now` を固定の 0 で流す（表情の遅延切り替えを見るテストは
// applySessionEvent を直接呼び、進める時刻を明示する）。
function apply(...events: readonly SessionEvent[]): SessionState {
  return events.reduce((view, event) => applySessionEvent(view, event, 0), INITIAL_SESSION_STATE)
}

describe("applySessionEvent", () => {
  it("書きかけの本文をつなぎ、完成した本文が来たら置き換える（二重に積まない）", () => {
    const streaming = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "partial-utterance", text: "ダミ" },
      { kind: "partial-utterance", text: "ーの本文" },
    )

    expect(streaming.partialUtterance).toBe("ダミーの本文")
    expect(mainViewEntries(streaming)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "ダミーの本文" },
    ])

    const settled = applySessionEvent(
      streaming,
      { kind: "utterance", text: "ダミーの本文です。" },
      0,
    )

    expect(settled.partialUtterance).toBe("")
    expect(mainViewEntries(settled)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "ダミーの本文です。" },
    ])
  })

  it("書きかけのまま終わったターンの本文を捨てない", () => {
    const view = apply(
      { kind: "partial-utterance", text: "途中まで" },
      { kind: "turn-finished", status: "error" },
    )

    expect(view.partialUtterance).toBe("")
    expect(mainViewEntries(view)).toEqual([{ kind: "detail", markdown: "途中まで" }])
  })

  it("セリフと表情を持ち、セリフが来ないターンでも消さない", () => {
    const spoken = apply({ kind: "speech", text: "いくよ！", expression: "proud" })

    expect(spoken.speeches).toEqual(["いくよ！"])
    expect(currentExpression(spoken, 0)).toBe("proud")

    const nextTurn = applySessionEvent(spoken, { kind: "request", text: "ダミーの依頼" }, 0)

    expect(nextTurn.speeches).toEqual(["いくよ！"])
  })

  it("同じターン内のセリフは件数を絞らず、古い→新しいの順に並べる", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "speech", text: "1つめ", expression: "default" },
      { kind: "speech", text: "2つめ", expression: "default" },
      { kind: "speech", text: "3つめ", expression: "default" },
      { kind: "speech", text: "4つめ", expression: "proud" },
    )

    expect(view.speeches).toEqual(["1つめ", "2つめ", "3つめ", "4つめ"])
  })

  it("新しいターンの request の直後は、前のターンのセリフの最後の1件だけを残す", () => {
    const firstTurn = apply(
      { kind: "request", text: "1つめの依頼" },
      { kind: "speech", text: "1つめのセリフ", expression: "default" },
      { kind: "speech", text: "1つめの2つめのセリフ", expression: "default" },
    )

    const secondTurnStarted = applySessionEvent(
      firstTurn,
      { kind: "request", text: "2つめの依頼" },
      0,
    )
    // 消すとキャラクターが消えたように見えるので最後の1件だけ残す。前のターンの並びを丸ごとは
    // 持ち越さない（次のターンの冒頭に前のターンの並びが残らないようにする）。
    expect(secondTurnStarted.speeches).toEqual(["1つめの2つめのセリフ"])

    const secondTurnSpoken = applySessionEvent(
      secondTurnStarted,
      { kind: "speech", text: "2つめのセリフ", expression: "default" },
      0,
    )
    // 次の speak が来た時点で、そのターンのものだけになる。
    expect(secondTurnSpoken.speeches).toEqual(["2つめのセリフ"])
  })

  it("ツールが1秒以上実行中だと表情が作業中になり、終わると直前のセリフの表情に戻る", () => {
    const spoken = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "いくよ！", expression: "proud" },
      0,
    )
    const running = applySessionEvent(
      spoken,
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      0,
    )

    // 開始直後はまだ1秒経っていないので、直前のセリフの表情のまま。
    expect(currentExpression(running, 0)).toBe("proud")
    // 1秒経つと作業中に切り替わる。
    expect(currentExpression(running, 1000)).toBe("working")
    expect(running.runningTools).toEqual([
      { toolUseId: "toolu_1", name: "Read", input: {}, nested: false, startedAt: 0 },
    ])

    const finished = applySessionEvent(
      running,
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: false },
      2000,
    )

    expect(currentExpression(finished, 2000)).toBe("proud")
    expect(finished.runningTools).toEqual([])
    expect(finished.finishedTools).toEqual([
      { toolUseId: "toolu_1", name: "Read", input: {}, nested: false, startedAt: 0 },
    ])
  })

  it("1秒未満で終わったツールは作業中の表情を起こさない（チカチカ防止）", () => {
    const spoken = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "いくよ！", expression: "proud" },
      0,
    )
    const running = applySessionEvent(
      spoken,
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      0,
    )

    const finished = applySessionEvent(
      running,
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: false },
      500,
    )

    // 実行中だった間（500ms 経過時点）も、終わったあとも、作業中の表情は一度も出ない。
    expect(currentExpression(finished, 500)).toBe("proud")
    expect(currentExpression(finished, 5000)).toBe("proud")
  })

  it("サブエージェントの中のツール（parentToolUseId あり）は nested として持つ", () => {
    const running = apply({
      kind: "tool-started",
      toolUseId: "toolu_1",
      name: "Bash",
      input: {},
      parentToolUseId: "toolu_agent",
    })

    expect(running.runningTools).toEqual([
      { toolUseId: "toolu_1", name: "Bash", input: {}, nested: true, startedAt: 0 },
    ])
  })

  it("finishedTools は6件来たら6件とも残す（5件に絞らない。並びは自前でスクロールする）", () => {
    const events = Array.from({ length: 6 }, (_unused, index): SessionEvent[] => {
      const toolUseId = `toolu_${String(index)}`
      return [
        {
          kind: "tool-started",
          toolUseId,
          name: "Read",
          input: {},
          parentToolUseId: undefined,
        },
        { kind: "tool-finished", toolUseId, content: "ダミーの結果", isError: false },
      ]
    }).flat()

    const view = apply(...events)

    expect(view.finishedTools).toHaveLength(6)
  })

  it("ツールの結果を、対応する tool_use の記録に合わせる（メインビューにはツール系を渡さない）", () => {
    const view = apply(
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: { path: "/tmp/a" },
        parentToolUseId: undefined,
      },
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: true },
    )

    // ツールの記録そのものは持ち続ける（サイドバー用途。docs/requirements.md 4.2）が、
    // メインビューはレポートだけを出すので `mainViewEntries` には渡さない。
    expect(view.records).toEqual([
      {
        kind: "tool",
        toolUseId: "toolu_1",
        name: "Read",
        input: { path: "/tmp/a" },
        nested: false,
        startedAt: 0,
        result: { content: "ダミーの結果", isError: true },
      },
    ])
    expect(mainViewEntries(view)).toEqual([])
  })

  it("mainViewEntries はツール系の entry を含まない（依頼とレポートの間に挟まっていても除く）", () => {
    const view = apply(
      { kind: "request", text: "依頼" },
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      { kind: "tool-finished", toolUseId: "toolu_1", content: "結果", isError: false },
      { kind: "utterance", text: "レポート本文" },
    )

    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "依頼" },
      { kind: "detail", markdown: "レポート本文" },
    ])
  })

  it("対応する tool_use が無い結果は記録に足さない", () => {
    const view = apply({
      kind: "tool-finished",
      toolUseId: "toolu_unknown",
      content: "ダミーの結果",
      isError: false,
    })

    expect(mainViewEntries(view)).toEqual([])
  })

  it("init のたびにセッション情報を上書きする（端末専用コマンドは候補から除く）", () => {
    const view = apply(
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-opus-5",
        permissionMode: "auto",
        slashCommands: ["clear"],
        terminalSlashCommands: [],
      },
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-opus-5",
        permissionMode: "default",
        slashCommands: ["clear", "model", "doctor"],
        terminalSlashCommands: ["doctor"],
      },
    )

    expect(view.permissionMode).toBe("default")
    expect(view.slashCommands).toEqual(["clear", "model"])
  })

  it("セッションが終わると理由を持ち、実行中のツールを空にする", () => {
    const view = apply(
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      { kind: "session-ended", reason: "セッションが終了した" },
    )

    expect(view.endedReason).toBe("セッションが終了した")
    expect(view.runningTools).toEqual([])
  })

  it("request でターンが進行中になり、turn-finished で止まる（入力欄の送信/中断の切り替えに使う）", () => {
    expect(INITIAL_SESSION_STATE.turnInProgress).toBe(false)

    const started = apply({ kind: "request", text: "ダミーの依頼" })
    expect(started.turnInProgress).toBe(true)

    const finished = applySessionEvent(started, { kind: "turn-finished", status: "success" }, 0)
    expect(finished.turnInProgress).toBe(false)
  })

  it("session-ended でも進行中を止める（中断・異常終了のどちらでも入力欄を送信可能に戻す）", () => {
    const started = apply({ kind: "request", text: "ダミーの依頼" })

    const ended = applySessionEvent(
      started,
      { kind: "session-ended", reason: "セッションが終了した" },
      0,
    )

    expect(ended.turnInProgress).toBe(false)
  })

  it("request で turnStartedAt を打ち、turn-finished で turnFinishedAt が止まる（入力欄の経過時間表示に使う）", () => {
    expect(INITIAL_SESSION_STATE.turnStartedAt).toBeUndefined()
    expect(INITIAL_SESSION_STATE.turnFinishedAt).toBeUndefined()

    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "ダミーの依頼" },
      100,
    )
    expect(started.turnStartedAt).toBe(100)
    expect(started.turnFinishedAt).toBeUndefined()

    const finished = applySessionEvent(started, { kind: "turn-finished", status: "success" }, 300)
    expect(finished.turnStartedAt).toBe(100)
    expect(finished.turnFinishedAt).toBe(300)

    // 次の依頼で0から数え直す（turnFinishedAt が undefined に戻る）。
    const restarted = applySessionEvent(finished, { kind: "request", text: "次の依頼" }, 400)
    expect(restarted.turnStartedAt).toBe(400)
    expect(restarted.turnFinishedAt).toBeUndefined()
  })

  it("session-ended でも turnFinishedAt を打つ（中断・異常終了でも経過時間表示が止まる）", () => {
    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "ダミーの依頼" },
      100,
    )

    const ended = applySessionEvent(
      started,
      { kind: "session-ended", reason: "セッションが終了した" },
      250,
    )

    expect(ended.turnStartedAt).toBe(100)
    expect(ended.turnFinishedAt).toBe(250)
  })

  it("tasks-changed で develop/tasks.json の一覧を持ち、届くまでは undefined", () => {
    expect(INITIAL_SESSION_STATE.tasks).toBeUndefined()

    const tasks = [{ id: "X-001", summary: "架空のタスク", status: "todo" }]
    const withTasks = apply({ kind: "tasks-changed", tasks })
    expect(withTasks.tasks).toEqual(tasks)

    const cleared = applySessionEvent(withTasks, { kind: "tasks-changed", tasks: undefined }, 0)
    expect(cleared.tasks).toBeUndefined()
  })

  it("答え待ちの列をそのまま持つ", () => {
    const view = apply({
      kind: "pending-changed",
      pending: [{ kind: "permission", id: "toolu_1", toolName: "Bash", input: {} }],
    })

    expect(view.pending.map((ask) => ask.id)).toEqual(["toolu_1"])
  })

  it("speak が1回も呼ばれなかったターンでは、行頭マーカーの補助で吹き出しを埋め、本文からマーカー行を除く", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "utterance", text: "アスナ: 補助で拾ったセリフ\n本文はこちら" },
    )

    expect(view.speeches).toEqual(["補助で拾ったセリフ"])
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "本文はこちら" },
    ])
  })

  it("speak が呼ばれたターンでも、本文に紛れたマーカー行は吹き出しへ回して本文から除く", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "speech", text: "本物のセリフ", expression: "proud" },
      { kind: "utterance", text: "アスナ: マーカー行\n本文はこちら" },
    )

    expect(view.speeches).toEqual(["本物のセリフ", "マーカー行"])
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "本文はこちら" },
    ])
  })

  it("記録はターン数の窓（直近20ターン）だけを残し、古いターンは落とす", () => {
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}` })
      events.push({ kind: "utterance", text: `レポート${String(turn)}` })
    }

    const view = apply(...events)
    const requestTexts = mainViewEntries(view)
      .filter((entry): entry is { kind: "request"; text: string } => entry.kind === "request")
      .map((entry) => entry.text)

    expect(requestTexts).toHaveLength(20)
    expect(requestTexts[0]).toBe("依頼5")
    expect(requestTexts.at(-1)).toBe("依頼24")
  })
})

describe("commandSuggestions", () => {
  const info: SessionEvent = {
    kind: "session-info",
    sessionId: "s-1",
    model: undefined,
    permissionMode: undefined,
    slashCommands: ["clear", "model", "doctor"],
    terminalSlashCommands: ["doctor"],
  }

  it("説明が届く前は名前だけ（description は undefined）を返す", () => {
    expect(commandSuggestions(apply(info))).toEqual([
      { name: "clear", description: undefined },
      { name: "model", description: undefined },
    ])
  })

  it("init 前（slashCommands が空）でも commandDescriptions が届いていれば名前の出どころにする", () => {
    const view = apply({
      kind: "command-descriptions",
      descriptions: [
        { name: "clear", description: "会話をリセットする" },
        { name: "model", description: undefined },
      ],
    })

    expect(view.slashCommands).toEqual([])
    expect(commandSuggestions(view)).toEqual([
      { name: "clear", description: "会話をリセットする" },
      { name: "model", description: undefined },
    ])
  })

  it("届いた説明を同じ名前の候補に添える（説明の無いものは undefined のまま）", () => {
    const view = apply(info, {
      kind: "command-descriptions",
      descriptions: [
        { name: "clear", description: "会話をリセットする" },
        { name: "model", description: undefined },
        { name: "doctor", description: "端末専用なので候補に出ない" },
      ],
    })

    expect(commandSuggestions(view)).toEqual([
      { name: "clear", description: "会話をリセットする" },
      { name: "model", description: undefined },
    ])
  })

  it("説明が先に届いても、あとから来た init の候補に添わる", () => {
    const view = apply(
      {
        kind: "command-descriptions",
        descriptions: [{ name: "clear", description: "会話をリセットする" }],
      },
      info,
    )

    expect(commandSuggestions(view)).toEqual([
      { name: "clear", description: "会話をリセットする" },
      { name: "model", description: undefined },
    ])
  })
})

describe("commandCandidates", () => {
  it("端末専用のコマンドを除いた残りを返す", () => {
    expect(commandCandidates(["clear", "model", "doctor"], ["doctor"])).toEqual(["clear", "model"])
  })

  it("端末専用が空のときはそのまま返す", () => {
    expect(commandCandidates(["clear", "model"], [])).toEqual(["clear", "model"])
  })

  it("元の並び順を保つ（並べ替えない）", () => {
    expect(commandCandidates(["b", "a", "c"], ["a"])).toEqual(["b", "c"])
  })
})
