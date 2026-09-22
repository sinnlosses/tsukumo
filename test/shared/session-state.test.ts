import { describe, expect, it } from "bun:test"

import { mainViewEntries, mainViewTurns } from "../../src/shared/main-view.ts"
import { type SessionEvent } from "../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../src/shared/session-state.ts"
import { characterInfo, shownOutfitAccents, shownPortraits } from "../fixture/character.ts"

// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。
// 時刻に依らないテストでは `now` を固定の 0 で流す（時刻を見る畳み込みは
// applySessionEvent を直接呼び、進める時刻を明示する）。
function apply(...events: readonly SessionEvent[]): SessionState {
  return events.reduce((view, event) => applySessionEvent(view, event, 0), INITIAL_SESSION_STATE)
}

/**
 * `state.session` が `running`（`init` 済みで `permissionMode` も分かっている）である前提で
 * 取り出す。まだなら失敗させる。**`running` という名前は他のテストがローカル変数として
 * 使っている**（ツールが動いている状態の意味）ので、ここでは衝突しないよう `runningSession`
 * にする。**`model` はここに無い**（`SessionState.model` を直接読む。`session` の外にある
 * 理由は `SessionInfo` 冒頭のコメント）。
 */
function runningSession(
  state: SessionState,
): Extract<SessionState["session"], { kind: "running" }> {
  if (state.session.kind !== "running") {
    throw new Error("session-info がまだ届いていない、または permissionMode が未確定")
  }
  return state.session
}

/** `sessionId` が分かっている（`identified` か `running`）ときだけ返す。まだなら undefined。 */
function sessionIdOf(state: SessionState): string | undefined {
  return state.session.kind === "starting" ? undefined : state.session.sessionId
}

/** 架空のキャラクターパックが決まったところ。 */
const CHARACTER_FIXTURE: SessionEvent = {
  kind: "character-changed",
  ...characterInfo(),
  packs: [{ name: "fictional", label: "架空の精霊" }],
}

describe("applySessionEvent", () => {
  it("書きかけの本文をつなぎ、完成した本文が来たら置き換える（二重に積まない）", () => {
    const streaming = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "partial-utterance", text: "ダミ" },
      { kind: "partial-utterance", text: "ーの本文" },
    )

    expect(streaming.partialUtterance).toBe("ダミーの本文")
    expect(mainViewEntries(streaming)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "detail", markdown: "ダミーの本文" },
    ])

    const settled = applySessionEvent(
      streaming,
      { kind: "utterance", text: "ダミーの本文です。" },
      0,
    )

    expect(settled.partialUtterance).toBe("")
    expect(mainViewEntries(settled)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
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

    const nextTurn = applySessionEvent(
      spoken,
      { kind: "request", text: "ダミーの依頼", images: [] },
      0,
    )

    // 空にするとプレースホルダー「（まだ発話がありません）」に切り替わる
    // （src/browser/features/character-view/balloon-track.tsx）。
    expect(nextTurn.speeches).toEqual([])
    expect(nextTurn.speechExpression).toBe("default")
  })

  it("セリフは記録にも積むが、レポート（mainViewEntries）には出さない", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "utterance", text: "ダミーのレポート" },
    )

    // 記録には残す（過去のターンの吹き出しを引き直すため。shared/turn-speech.ts）。
    expect(view.records).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
    // メインビューにはセリフを出さない（吹き出しだけ。docs/requirements.md 4.2）。
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
    // `MainViewEntry` には `speech` の種類そのものが無い（型の側でも混ざらない）。
  })

  it("圧縮の区切り（compact-boundary）は記録に積むが、レポート（mainViewEntries）には出さない", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "compact-boundary" },
      { kind: "request", text: "2つめの依頼", images: [] },
    )

    // 記録には積む（雑談のログ側 shared/chat-log.ts が読む）。
    expect(view.records).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "compact-boundary" },
      { kind: "request", turnId: 1, text: "2つめの依頼", images: [] },
    ])
    // 仕事のメインビューには出さない（docs/requirements.md 4.9）。
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "request", turnId: 1, text: "2つめの依頼", images: [] },
    ])
  })

  it("同じターン内のセリフは件数を絞らず、古い→新しいの順に並べる", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "1つめ", expression: "default" },
      { kind: "speech", text: "2つめ", expression: "default" },
      { kind: "speech", text: "3つめ", expression: "default" },
      { kind: "speech", text: "4つめ", expression: "proud" },
    )

    expect(view.speeches).toEqual(["1つめ", "2つめ", "3つめ", "4つめ"])
  })

  it("新しいターンの request の直後は吹き出しを空にし、次の speak でそのターンのものだけになる", () => {
    const firstTurn = apply(
      { kind: "request", text: "1つめの依頼", images: [] },
      { kind: "speech", text: "1つめのセリフ", expression: "default" },
      { kind: "speech", text: "1つめの2つめのセリフ", expression: "default" },
    )

    const secondTurnStarted = applySessionEvent(
      firstTurn,
      { kind: "request", text: "2つめの依頼", images: [] },
      0,
    )
    // 送信した時点で前のターンの一言は残さず空にする（次のターンに移ったことが画面から
    // 分かるように）。
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

  it("結果が届くまでのツールの記録は running", () => {
    const view = apply({
      kind: "tool-started",
      toolUseId: "toolu_1",
      name: "Read",
      input: {},
      parentToolUseId: undefined,
    })

    expect(view.records).toEqual([
      {
        kind: "tool",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        nested: false,
        status: { kind: "running" },
      },
    ])
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
        status: { kind: "finished", result: { content: "ダミーの結果", isError: true } },
      },
    ])
    // メインビューへ渡す tool の記録が持つのは名前・入力・結果だけ（描くかどうかは
    // `src/browser/features/main-view/turn.tsx` の仕事で、いまはツールを描かない）。
    expect(mainViewEntries(view)).toEqual([
      {
        kind: "tool",
        name: "Read",
        input: { path: "/tmp/a" },
        status: { kind: "finished", result: { content: "ダミーの結果", isError: true } },
      },
    ])
  })

  it("mainViewEntries はツール系の entry も含む（`groupIntoTurns` / `selectShownReports` の材料になる）", () => {
    const view = apply(
      { kind: "request", text: "依頼", images: [] },
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
      { kind: "request", turnId: 0, text: "依頼", images: [] },
      {
        kind: "tool",
        name: "Read",
        input: {},
        status: { kind: "finished", result: { content: "結果", isError: false } },
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

    expect(runningSession(view).permissionMode).toBe("default")
    expect(view.slashCommands).toEqual(["clear", "model"])
  })

  it("model-changed は知っている別名（MODEL_ALIASES）のときだけ先回りでモデルを更新する", () => {
    const view = apply(
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-sonnet-5",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
      },
      { kind: "model-changed", model: "haiku" },
    )

    expect(view.model).toBe("haiku")
  })

  it("model-changed が知らない値（MODEL_ALIASES に無い）のときは state.model を変えない", () => {
    const view = apply(
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-sonnet-5",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
      },
      { kind: "model-changed", model: "best" },
    )

    expect(view.model).toBe("claude-sonnet-5")
  })

  // 実機で確かめた回帰: 1件も依頼を送っていない（`init` がまだ届いていない）うちにサイドバーで
  // モデルを切り替えると、駆動は切り替わっているのに表示だけ5秒ほどで古い値に戻っていた
  // （`model-changed` を `session.kind === "running"` のときだけ効かせていたときの不具合）。
  // `model` は `session` の外にあるので、`starting`/`identified` の間でも更新できる。
  it("model-changed は init より前（session が starting）でも効く", () => {
    expect(INITIAL_SESSION_STATE.session.kind).toBe("starting")

    const view = apply({ kind: "model-changed", model: "sonnet" })

    expect(view.session.kind).toBe("starting")
    expect(view.model).toBe("sonnet")
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
    expect(INITIAL_SESSION_STATE.turn.kind).toBe("idle")

    const started = apply({ kind: "request", text: "ダミーの依頼", images: [] })
    expect(started.turn.kind).toBe("running")

    const finished = applySessionEvent(started, { kind: "turn-finished", status: "success" }, 0)
    expect(finished.turn.kind).toBe("finished")
  })

  it("turn-started はターンを始めるが、記録を1件も積まない（話しかけてもらった一言を残さない）", () => {
    const spoken = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
    )

    const started = applySessionEvent(spoken, { kind: "turn-started" }, 700)

    // 記録は前のターンのまま（送った文面はどこにも入らないので、雑談のログにも
    // メインビューにも出ようが無い。docs/design.md 13.7）。
    expect(started.records).toEqual(spoken.records)
    // ターンの始まりとしての効き目は `request` と同じ。
    expect(started.turn).toEqual({ kind: "running", startedAt: 700 })
    expect(started.speeches).toEqual([])
    expect(started.speechExpression).toBe("default")
    expect(started.speechCalledInTurn).toBe(false)
  })

  it("session-ended でも進行中を止める（中断・異常終了のどちらでも入力欄を送信可能に戻す）", () => {
    const started = apply({ kind: "request", text: "ダミーの依頼", images: [] })

    const ended = applySessionEvent(
      started,
      { kind: "session-ended", reason: "セッションが終了した" },
      0,
    )

    expect(ended.turn.kind).toBe("finished")
  })

  it("request で起点を打ち、turn-finished で終わった時刻が止まる（入力欄の経過時間表示に使う）", () => {
    expect(INITIAL_SESSION_STATE.turn).toEqual({ kind: "idle" })

    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "ダミーの依頼", images: [] },
      100,
    )
    expect(started.turn).toEqual({ kind: "running", startedAt: 100 })

    const finished = applySessionEvent(started, { kind: "turn-finished", status: "success" }, 300)
    expect(finished.turn).toEqual({ kind: "finished", startedAt: 100, finishedAt: 300 })

    // 次の依頼で0から数え直す（`running` に戻るので、終わった時刻はもう持たない）。
    const restarted = applySessionEvent(
      finished,
      { kind: "request", text: "次の依頼", images: [] },
      400,
    )
    expect(restarted.turn).toEqual({ kind: "running", startedAt: 400 })
  })

  it("始まっていないターンは session-ended でも終わらない（idle のまま）", () => {
    const ended = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "session-ended", reason: "セッションが終了した" },
      250,
    )

    expect(ended.turn).toEqual({ kind: "idle" })
  })

  it("session-ended でも終わった時刻を打つ（中断・異常終了でも経過時間表示が止まる）", () => {
    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "ダミーの依頼", images: [] },
      100,
    )

    const ended = applySessionEvent(
      started,
      { kind: "session-ended", reason: "セッションが終了した" },
      250,
    )

    expect(ended.turn).toEqual({ kind: "finished", startedAt: 100, finishedAt: 250 })
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
      CHARACTER_FIXTURE,
      {
        kind: "session-info",
        sessionId: "session-dummy",
        model: "claude-opus-5",
        permissionMode: "auto",
        slashCommands: ["clear"],
        terminalSlashCommands: [],
      },
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "speech", text: "架空のセリフ", expression: "proud" },
      { kind: "utterance", text: "架空のレポート" },
      { kind: "request", text: "/clear", images: [] },
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
    expect(runningSession(cleared).sessionId).toBe("session-dummy")
    expect(cleared.model).toBe("claude-opus-5")
    expect(runningSession(cleared).permissionMode).toBe("auto")
    expect(cleared.slashCommands).toEqual(["clear"])
  })

  it("普通のターン（request）は records を残す（丸ごと空にするのは /clear だけ）", () => {
    const before = apply(
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "speech", text: "架空のセリフ1", expression: "default" },
      { kind: "speech", text: "架空のセリフ2", expression: "default" },
      { kind: "request", text: "次の架空の依頼", images: [] },
    )

    // speeches は request のたびに空になる（送信直後に分かるように）が、records は
    // 過去のターンを遡れるように残す。
    expect(before.speeches).toEqual([])
    expect(before.records.length).toBeGreaterThan(0)
  })

  it("tasks-changed で develop/tasks.json の一覧を持ち、届くまでは不明", () => {
    expect(INITIAL_SESSION_STATE.tasks).toEqual({ kind: "unknown" })

    const items = [
      {
        id: "X-001",
        summary: "架空のタスク",
        status: "todo",
        difficulty: "sonnet",
        loopable: "Y",
        dependencies: [],
      },
    ]
    const withTasks = apply({ kind: "tasks-changed", tasks: { kind: "known", items } })
    expect(withTasks.tasks).toEqual({ kind: "known", items })

    const cleared = applySessionEvent(
      withTasks,
      { kind: "tasks-changed", tasks: { kind: "unknown" } },
      0,
    )
    expect(cleared.tasks).toEqual({ kind: "unknown" })
  })

  it("sessions-changed で切り替え先の一覧を持ち、届くまでは空", () => {
    expect(INITIAL_SESSION_STATE.sessions).toEqual([])

    // 目印と最終更新時刻だけ（会話の内容は入らない）。
    const sessions = [
      { viewPort: 7328, sessionId: "s-架空-2", lastModified: 2_000 },
      { viewPort: 7327, sessionId: "s-架空-1", lastModified: 1_000 },
    ]
    const listed = apply({ kind: "sessions-changed", sessions, current: "s-架空-1" })
    expect(listed.sessions).toEqual(sessions)
    // **`init` を待たずに居場所が決まる**（続きから始めたときだけ）。`model` / `permissionMode`
    // はまだなので `identified`（`sessionId` だけ）に留まる。
    expect(listed.session.kind).toBe("identified")
    expect(sessionIdOf(listed)).toBe("s-架空-1")
  })

  it("sessions-changed が running のときに来たら、sessionId だけ差し替えて permissionMode は引き継ぐ（model は session と無関係にそのまま残る）", () => {
    const withInit = apply({
      kind: "session-info",
      sessionId: "s-架空-旧",
      model: "claude-opus-5",
      permissionMode: "auto",
      slashCommands: [],
      terminalSlashCommands: [],
    })

    const listed = applySessionEvent(
      withInit,
      {
        kind: "sessions-changed",
        sessions: [{ viewPort: 7327, sessionId: "s-架空-新", lastModified: 0 }],
        current: "s-架空-新",
      },
      0,
    )

    expect(runningSession(listed).sessionId).toBe("s-架空-新")
    expect(runningSession(listed).permissionMode).toBe("auto")
    expect(listed.model).toBe("claude-opus-5")
  })

  it("sessions-changed が新規（current なし）なら、いまのセッションのIDは変えない", () => {
    // model / permissionMode の片方だけ届いても sessionId だけの identified に畳む。
    const withId = apply({
      kind: "session-info",
      sessionId: "s-架空-init",
      model: "claude-opus-5",
      permissionMode: undefined,
      slashCommands: [],
      terminalSlashCommands: [],
    })
    expect(withId.session.kind).toBe("identified")

    const listed = applySessionEvent(
      withId,
      { kind: "sessions-changed", sessions: [], current: undefined },
      0,
    )
    expect(sessionIdOf(listed)).toBe("s-架空-init")
  })

  // 回帰: `permissionMode` がまだ届かず `identified` のままでも、`model-changed` は
  // `model` だけを更新できる（`session` はそのまま）。実機で確かめたサイドバーのモデル切り替えが
  // 戻ってしまう不具合はこれが効いていなかったために起きた。
  it("model-changed は identified（permissionMode がまだ）でも model を更新し、session は動かさない", () => {
    const identified = apply({
      kind: "session-info",
      sessionId: "s-架空-identified",
      model: undefined,
      permissionMode: undefined,
      slashCommands: [],
      terminalSlashCommands: [],
    })
    expect(identified.session.kind).toBe("identified")

    const after = applySessionEvent(identified, { kind: "model-changed", model: "haiku" }, 0)

    expect(after.session).toEqual(identified.session)
    expect(after.model).toBe("haiku")
  })

  it("character-changed でキャラクターパックの姿を持ち、届くまでは undefined", () => {
    expect(INITIAL_SESSION_STATE.character).toBeUndefined()

    // 姿はそのまま持ち、イベントだけが持つ `kind` / `packs` は混ざらない。
    const character = characterInfo({
      accent: "#f2b0a0",
      expressions: [
        { name: "default", label: "通常" },
        { name: "thinking", label: "作業中" },
      ],
      ...shownPortraits({
        default: "/character/default.svg",
        thinking: "/character/thinking.svg",
      }),
      outfitAccents: shownOutfitAccents({ default: "#b8c7ff" }),
    })

    const view = apply({
      kind: "character-changed",
      ...character,
      packs: [{ name: "fictional", label: "架空の精霊" }],
    })

    expect(view.character).toEqual(character)
  })

  it("答え待ちの列をそのまま持つ", () => {
    const view = apply({
      kind: "pending-changed",
      pending: [{ kind: "permission", id: "toolu_1", toolName: "Bash", input: {} }],
    })

    expect(view.pending.map((ask) => ask.id)).toEqual(["toolu_1"])
  })

  it("記録はターン数の窓（直近20ターン）だけを残し、古いターンは落とす", () => {
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      events.push({ kind: "utterance", text: `レポート${String(turn)}` })
    }

    const view = apply(...events)
    const requestTexts = mainViewEntries(view)
      .filter((entry) => entry.kind === "request")
      .map((entry) => entry.text)

    expect(requestTexts).toHaveLength(20)
    expect(requestTexts[0]).toBe("依頼5")
    expect(requestTexts.at(-1)).toBe("依頼24")
  })

  it("雑談モードでは窓が100ターンに広がる（仕事の20ターンより後ろまで残る）", () => {
    const events: SessionEvent[] = [{ kind: "chat-mode-changed", chat: true }]
    for (let turn = 0; turn < 105; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      events.push({ kind: "utterance", text: `雑談${String(turn)}` })
    }

    const view = apply(...events)
    const requestTexts = mainViewEntries(view)
      .filter((entry) => entry.kind === "request")
      .map((entry) => entry.text)

    expect(requestTexts).toHaveLength(100)
    expect(requestTexts[0]).toBe("依頼5")
    expect(requestTexts.at(-1)).toBe("依頼104")
  })

  it("窓がいっぱいになっても、ターンの通し番号は止まらずに増え続ける", () => {
    // 番号を位置で決めていたころは、窓（20ターン）を超えると**いちばん新しいターンの番号が
    // 19 で止まり**、描く側が `key` に使っているせいで部品が作り直されず、書き上げる演出が
    // 二度と起動しなかった（`src/browser/features/main-view/report-reveal.ts`）。
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      events.push({ kind: "utterance", text: `本文${String(turn)}` })
      events.push({ kind: "turn-finished", status: "success" })
    }

    const view = apply(...events)
    const turns = mainViewTurns(mainViewEntries(view), false)

    expect(turns.at(-1)?.id).toBe(24)
    expect(turns.map((turn) => turn.id)).toEqual([20, 21, 22, 23, 24])
  })

  it("圧縮の区切り（compact-boundary）を挟んでも、窓の数え方（request の数）は変わらない", () => {
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      if (turn === 10) {
        events.push({ kind: "compact-boundary" })
      }
    }

    const view = apply(...events)
    const requestTexts = view.records
      .filter((record) => record.kind === "request")
      .map((record) => record.text)

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
      { label: "案A", description: "架空の説明A", preview: undefined },
      { label: "案B", description: "架空の説明B", preview: undefined },
    ],
  }

  const multiQuestion = {
    header: "確認",
    text: "どれを試す？",
    multiSelect: true,
    options: [
      { label: "案A", description: "架空の説明A", preview: undefined },
      { label: "案B", description: "架空の説明B", preview: undefined },
      { label: "案C", description: "架空の説明C", preview: undefined },
    ],
  }

  function questionEntries(...events: readonly SessionEvent[]) {
    return mainViewEntries(apply(...events)).filter((entry) => entry.kind === "question")
  }

  it("質問に答えると、そのやり取りの記録に質問1件が残る", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼", images: [] },
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
      { kind: "request", text: "架空の依頼", images: [] },
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
      { kind: "request", text: "架空の依頼", images: [] },
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
      { kind: "request", text: "架空の依頼", images: [] },
      {
        kind: "pending-changed",
        pending: [{ kind: "question", id: "toolu_q", questions: [singleQuestion] }],
      },
    )

    expect(entries).toEqual([])
  })

  it("記録は前のやり取りに残り、次の依頼で消えない", () => {
    const view = apply(
      { kind: "request", text: "架空の依頼1", images: [] },
      { kind: "question-answered", questions: [singleQuestion], answers: [["案A"]] },
      { kind: "request", text: "架空の依頼2", images: [] },
    )

    expect(mainViewEntries(view).map((entry) => entry.kind)).toEqual([
      "request",
      "question",
      "request",
    ])
  })
})
