import { describe, expect, it } from "bun:test"

import { type SessionEvent } from "../../src/protocol/session-event.ts"
import {
  applySessionEvent,
  commandCandidates,
  commandSuggestions,
  INITIAL_SESSION_STATE,
  mainViewEntries,
  type SessionState,
} from "../../src/protocol/session-state.ts"
import { turnSpeeches } from "../../src/protocol/turn-speech.ts"

// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。
// 時刻に依らないテストでは `now` を固定の 0 で流す（時刻を見る畳み込みは
// applySessionEvent を直接呼び、進める時刻を明示する）。
function apply(...events: readonly SessionEvent[]): SessionState {
  return events.reduce((view, event) => applySessionEvent(view, event, 0), INITIAL_SESSION_STATE)
}

/**
 * 行頭マーカーを持つ架空のキャラクターパックが決まったところ。**マーカーは定義ファイル側から
 * 来る**ので、補助を見るテストはこれを先に流す（docs/design.md 7章）。
 */
const CHARACTER_WITH_MARKER: SessionEvent = {
  kind: "character-changed",
  pack: "fictional",
  name: "架空の精霊",
  accent: undefined,
  speechMarker: "精霊: ",
  expressions: [{ name: "default", label: "通常" }],
  portraits: { default: undefined, thinking: undefined, proud: undefined, flustered: undefined },
  outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
  editable: true,
  packs: [{ name: "fictional", label: "架空の精霊" }],
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

  it("セリフと表情を持つ", () => {
    const spoken = apply({ kind: "speech", text: "いくよ！", expression: "proud" })

    expect(spoken.speeches).toEqual(["いくよ！"])
    expect(spoken.speechExpression).toBe("proud")
  })

  it("request で吹き出しと表情を既定に戻す（送信直後に次のターンへ移ったと分かるように）", () => {
    const spoken = apply({ kind: "speech", text: "いくよ！", expression: "proud" })

    const nextTurn = applySessionEvent(spoken, { kind: "request", text: "ダミーの依頼" }, 0)

    // 空にするとプレースホルダー「（まだ発話がありません）」に切り替わる
    // （src/ui/features/character-view/balloon-track.tsx）。
    expect(nextTurn.speeches).toEqual([])
    expect(nextTurn.speechExpression).toBe("default")
  })

  it("セリフは記録にも積むが、レポート（mainViewEntries）には出さない", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "utterance", text: "ダミーのレポート" },
    )

    // 記録には残す（過去のターンの吹き出しを引き直すため。protocol/turn-speech.ts）。
    expect(view.records).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
    // メインビューにはセリフを出さない（吹き出しだけ。docs/requirements.md 4.2）。
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
    // `MainViewEntry` には `speech` の種類そのものが無い（型の側でも混ざらない）。
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

  it("新しいターンの request の直後は吹き出しを空にし、次の speak でそのターンのものだけになる", () => {
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
    // 送信した時点で前のターンの一言は残さず空にする（次のターンに移ったことが画面から
    // 分かるように。2026-09-16 決定）。
    expect(secondTurnStarted.speeches).toEqual([])

    const secondTurnSpoken = applySessionEvent(
      secondTurnStarted,
      { kind: "speech", text: "2つめのセリフ", expression: "default" },
      0,
    )
    // 次の speak が来た時点で、そのターンのものだけになる。
    expect(secondTurnSpoken.speeches).toEqual(["2つめのセリフ"])
  })

  it("ツールが動いていても表情は直前の speak のまま変わらない（自動の上書きは 2026-09-17 に撤去）", () => {
    // 表情の源は `speak` の1つだけ（docs/requirements.md 4.3）。ツールの開始・終了・
    // 時間の経過では表情が動かないことを固定する（以前はここで `working` へ自動で
    // 切り替えていた。吹き出しと表情が食い違う唯一の経路だったのでやめた）。
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

    expect(running.speechExpression).toBe("proud")
    expect(running.runningTools).toEqual([
      {
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        nested: false,
        failureOutput: undefined,
      },
    ])

    const finished = applySessionEvent(
      running,
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: false },
      60_000,
    )

    // どれだけ時間が経っても（ツールが長く走っても、終わったあとも）表情は変わらない。
    expect(finished.speechExpression).toBe("proud")
    expect(finished.runningTools).toEqual([])
    expect(finished.finishedTools).toEqual([
      {
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        nested: false,
        failureOutput: undefined,
      },
    ])
  })

  it("失敗して終わったツールは出力を failureOutput に残す（サイドバーで開いて読むため）", () => {
    const running = applySessionEvent(
      INITIAL_SESSION_STATE,
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Bash",
        input: { command: "架空" },
        parentToolUseId: undefined,
      },
      0,
    )
    const failed = applySessionEvent(
      running,
      {
        kind: "tool-finished",
        toolUseId: "toolu_1",
        content: "架空のエラー出力",
        isError: true,
      },
      1000,
    )

    expect(failed.finishedTools[0]?.failureOutput).toBe("架空のエラー出力")
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
      {
        toolUseId: "toolu_1",
        name: "Bash",
        input: {},
        nested: true,
        failureOutput: undefined,
      },
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

  it("ツールの結果を、対応する tool_use の記録に合わせる（mainViewEntries は toolUseId 等を落として渡す）", () => {
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

    // ツールの記録そのものは `toolUseId` / `nested` を持つ（サイドバー用途と
    // 突き合わせ用。docs/requirements.md 4.2）。
    expect(view.records).toEqual([
      {
        kind: "tool",
        toolUseId: "toolu_1",
        name: "Read",
        input: { path: "/tmp/a" },
        nested: false,
        result: { content: "ダミーの結果", isError: true },
      },
    ])
    // メインビューへ渡す tool の記録が持つのは名前・入力・結果だけ（描くかどうかは
    // `src/ui/features/main-view/turn.tsx` の仕事で、いまはツールを描かない）。
    expect(mainViewEntries(view)).toEqual([
      {
        kind: "tool",
        name: "Read",
        input: { path: "/tmp/a" },
        result: { content: "ダミーの結果", isError: true },
      },
    ])
  })

  it("mainViewEntries はツール系の entry も含む（`groupIntoTurns` / `keepOnlyInterimReports` の材料になる）", () => {
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
      {
        kind: "tool",
        name: "Read",
        input: {},
        result: { content: "結果", isError: false },
      },
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

  it("session-restored で「続きから始まった」印が立つ（画面に出すためだけの値）", () => {
    expect(INITIAL_SESSION_STATE.restored).toBe(false)

    const restored = apply({ kind: "session-restored", sessionId: "s-1" })

    expect(restored.restored).toBe(true)
    // 印が立つだけで、記録も吹き出しも動かさない（履歴は組み直したイベントの側で入る）。
    expect(restored.records).toEqual([])
    expect(restored.speeches).toEqual([])
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

  it("tool-finished が isError:true のとき lastToolFailureAt にその時刻を打つ（立ち絵の「失敗でびくっ」の材料）", () => {
    expect(INITIAL_SESSION_STATE.lastToolFailureAt).toBeUndefined()

    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      100,
    )
    const failed = applySessionEvent(
      started,
      { kind: "tool-finished", toolUseId: "toolu_1", content: "失敗した", isError: true },
      400,
    )

    expect(failed.lastToolFailureAt).toBe(400)
  })

  it("tool-finished が isError:false のときは lastToolFailureAt を変えない", () => {
    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      100,
    )
    const finished = applySessionEvent(
      started,
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ok", isError: false },
      400,
    )

    expect(finished.lastToolFailureAt).toBeUndefined()
  })

  it("対応する tool_use が無い失敗は lastToolFailureAt を打たない（対応が取れない結果は捨てる）", () => {
    const result = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "tool-finished", toolUseId: "toolu_unknown", content: "失敗した", isError: true },
      400,
    )

    expect(result.lastToolFailureAt).toBeUndefined()
  })

  it("conversation-cleared で吹き出しと記録を空にする（/clear。キャラクターとセッション情報は残す）", () => {
    const before = apply(
      CHARACTER_WITH_MARKER,
      {
        kind: "session-info",
        sessionId: "session-dummy",
        model: "claude-opus-5",
        permissionMode: "auto",
        slashCommands: ["clear"],
        terminalSlashCommands: [],
      },
      { kind: "request", text: "架空の依頼" },
      { kind: "speech", text: "架空のセリフ", expression: "proud" },
      { kind: "utterance", text: "架空のレポート" },
      { kind: "request", text: "/clear" },
    )
    // "/clear" 自体も request なので、この時点で吹き出しはすでに空（record は残る）。
    expect(before.speeches).toEqual([])
    expect(before.records.length).toBeGreaterThan(0)

    const cleared = applySessionEvent(before, { kind: "conversation-cleared" }, 0)

    expect(cleared.speeches).toEqual([])
    expect(cleared.speechExpression).toBe("default")
    expect(cleared.speechCalledInTurn).toBe(false)
    expect(cleared.records).toEqual([])
    expect(cleared.partialUtterance).toBe("")
    // 画面が壊れないように、キャラクターとセッション情報は残す。
    expect(cleared.character).toEqual(before.character)
    expect(cleared.characterPacks).toEqual(before.characterPacks)
    expect(cleared.sessionId).toBe("session-dummy")
    expect(cleared.model).toBe("claude-opus-5")
    expect(cleared.permissionMode).toBe("auto")
    expect(cleared.slashCommands).toEqual(["clear"])
  })

  it("普通のターン（request）は records を残す（丸ごと空にするのは /clear だけ）", () => {
    const before = apply(
      { kind: "request", text: "架空の依頼" },
      { kind: "speech", text: "架空のセリフ1", expression: "default" },
      { kind: "speech", text: "架空のセリフ2", expression: "default" },
      { kind: "request", text: "次の架空の依頼" },
    )

    // speeches は request のたびに空になる（送信直後に分かるように）が、records は
    // 過去のターンを遡れるように残す。
    expect(before.speeches).toEqual([])
    expect(before.records.length).toBeGreaterThan(0)
  })

  it("tasks-changed で develop/tasks.json の一覧を持ち、届くまでは undefined", () => {
    expect(INITIAL_SESSION_STATE.tasks).toBeUndefined()

    const tasks = [
      {
        id: "X-001",
        summary: "架空のタスク",
        status: "todo",
        difficulty: "sonnet",
        loopable: "Y",
        dependencies: [],
      },
    ]
    const withTasks = apply({ kind: "tasks-changed", tasks })
    expect(withTasks.tasks).toEqual(tasks)

    const cleared = applySessionEvent(withTasks, { kind: "tasks-changed", tasks: undefined }, 0)
    expect(cleared.tasks).toBeUndefined()
  })

  it("character-changed でキャラクターパックの姿を持ち、届くまでは undefined", () => {
    expect(INITIAL_SESSION_STATE.character).toBeUndefined()

    const view = apply({
      kind: "character-changed",
      pack: "fictional",
      name: "架空の精霊",
      accent: "#f2b0a0",
      speechMarker: "精霊: ",
      expressions: [
        { name: "default", label: "通常" },
        { name: "thinking", label: "作業中" },
      ],
      packs: [{ name: "fictional", label: "架空の精霊" }],
      portraits: {
        default: "/character/default.svg",
        thinking: "/character/thinking.svg",
        proud: undefined,
        flustered: undefined,
      },
      outfitAccents: { default: "#b8c7ff", light: undefined, normal: undefined, heavy: undefined },
      editable: true,
    })

    expect(view.character).toEqual({
      pack: "fictional",
      name: "架空の精霊",
      accent: "#f2b0a0",
      speechMarker: "精霊: ",
      expressions: [
        { name: "default", label: "通常" },
        { name: "thinking", label: "作業中" },
      ],
      portraits: {
        default: "/character/default.svg",
        thinking: "/character/thinking.svg",
        proud: undefined,
        flustered: undefined,
      },
      outfitAccents: { default: "#b8c7ff", light: undefined, normal: undefined, heavy: undefined },
      editable: true,
    })
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
      CHARACTER_WITH_MARKER,
      { kind: "request", text: "ダミーの依頼" },
      { kind: "utterance", text: "精霊: 補助で拾ったセリフ\n本文はこちら" },
    )

    expect(view.speeches).toEqual(["補助で拾ったセリフ"])
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "本文はこちら" },
    ])
  })

  it("speak が呼ばれたターンでも、本文に紛れたマーカー行は吹き出しへ回して本文から除く", () => {
    const view = apply(
      CHARACTER_WITH_MARKER,
      { kind: "request", text: "ダミーの依頼" },
      { kind: "speech", text: "本物のセリフ", expression: "proud" },
      { kind: "utterance", text: "精霊: マーカー行\n本文はこちら" },
    )

    expect(view.speeches).toEqual(["本物のセリフ", "マーカー行"])
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "本文はこちら" },
    ])
  })

  it("行頭マーカーの補助で拾ったセリフも記録に積む（過去のターンで消えないため）", () => {
    const view = apply(
      CHARACTER_WITH_MARKER,
      { kind: "request", text: "ダミーの依頼" },
      { kind: "speech", text: "本物のセリフ", expression: "proud" },
      { kind: "utterance", text: "精霊: マーカー行\n本文はこちら" },
    )

    expect(turnSpeeches(view.records)).toEqual([
      { id: 0, speeches: ["本物のセリフ", "マーカー行"], expression: "proud" },
    ])
  })

  it("speechMarker が無いパックでは補助が効かず、本文はそのままレポートになる", () => {
    const view = apply(
      { ...CHARACTER_WITH_MARKER, speechMarker: undefined },
      { kind: "request", text: "ダミーの依頼" },
      { kind: "utterance", text: "精霊: マーカーのつもりの行\n本文はこちら" },
    )

    expect(view.speeches).toEqual([])
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "精霊: マーカーのつもりの行\n本文はこちら" },
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

describe("applySessionEvent（質問の記録）", () => {
  // 架空の質問。実物の会話は使わない（docs/coding-standards.md「会話内容の扱い」）。
  const singleQuestion = {
    header: "確認",
    text: "どちらの案で進める？",
    multiSelect: false,
    options: [
      { label: "案A", description: "架空の説明A" },
      { label: "案B", description: "架空の説明B" },
    ],
  }

  const multiQuestion = {
    header: "確認",
    text: "どれを試す？",
    multiSelect: true,
    options: [
      { label: "案A", description: "架空の説明A" },
      { label: "案B", description: "架空の説明B" },
      { label: "案C", description: "架空の説明C" },
    ],
  }

  function questionEntries(...events: readonly SessionEvent[]) {
    return mainViewEntries(apply(...events)).filter((entry) => entry.kind === "question")
  }

  it("質問に答えると、そのやり取りの記録に質問1件が残る", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼" },
      {
        kind: "question-answered",
        questions: [singleQuestion],
        answers: [["案B"]],
      },
    )

    expect(entries).toEqual([{ kind: "question", questions: [singleQuestion], answers: [["案B"]] }])
  })

  it("自由入力の答えも、選んだものとして記録に残る", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼" },
      {
        kind: "question-answered",
        questions: [singleQuestion],
        answers: [["どちらでもない架空の答え"]],
      },
    )

    expect(entries).toEqual([
      {
        kind: "question",
        questions: [singleQuestion],
        answers: [["どちらでもない架空の答え"]],
      },
    ])
  })

  it("複数選択の答えは1つの文字列に畳まれず、選んだぶんだけ並ぶ", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼" },
      {
        kind: "question-answered",
        questions: [multiQuestion],
        answers: [["案A", "案C"]],
      },
    )

    expect(entries).toEqual([
      { kind: "question", questions: [multiQuestion], answers: [["案A", "案C"]] },
    ])
  })

  it("答えていない質問（pending-changed だけ）は記録に残らない", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼" },
      {
        kind: "pending-changed",
        pending: [{ kind: "question", id: "toolu_q", questions: [singleQuestion] }],
      },
    )

    expect(entries).toEqual([])
  })

  it("記録は前のやり取りに残り、次の依頼で消えない", () => {
    const view = apply(
      { kind: "request", text: "架空の依頼1" },
      { kind: "question-answered", questions: [singleQuestion], answers: [["案A"]] },
      { kind: "request", text: "架空の依頼2" },
    )

    expect(mainViewEntries(view).map((entry) => entry.kind)).toEqual([
      "request",
      "question",
      "request",
    ])
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
