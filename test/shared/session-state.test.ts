import { describe, expect, it } from "bun:test"

import { type BackgroundTask } from "../../src/shared/background-task.ts"
import { MAX_MAIN_VIEW_TURNS, mainViewEntries, mainViewTurns } from "../../src/shared/main-view.ts"
import { type SessionEvent, type StampedEvent } from "../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../src/shared/session-state.ts"
import {
  characterChangedEvent,
  characterInfo,
  shownOutfitAccents,
  shownPortraits,
} from "../fixture/character.ts"

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
const CHARACTER_FIXTURE: SessionEvent = characterChangedEvent()

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
      { kind: "turn-finished", outcome: { kind: "interrupted" } },
    )

    expect(view.partialUtterance).toBe("")
    expect(mainViewEntries(view)).toEqual([{ kind: "detail", markdown: "途中まで" }])
  })

  it("見えない文字だけの本文は積まず、その前の本文を締めの本文から外さない", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "utterance", text: "ダミーのレポート" },
      { kind: "speech", text: "できたよ！", expression: "proud" },
      { kind: "partial-utterance", text: "​" },
      { kind: "utterance", text: "​" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    )

    expect(view.partialUtterance).toBe("")
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
  })

  it("書きかけの本文が見えない文字だけのあいだは、メインビューに出さない", () => {
    const streaming = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "partial-utterance", text: "​" },
    )

    expect(mainViewEntries(streaming)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
    ])
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
      {
        kind: "request",
        turnId: 0,
        text: "ダミーの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
      { kind: "speech", text: "いくよ！", expression: "proud", time: { kind: "stamped", at: 0 } },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
    // メインビューにはセリフを出さない（吹き出しだけ。docs/display.md 4.2）。
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
      {
        kind: "request",
        turnId: 0,
        text: "ダミーの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
      { kind: "speech", text: "いくよ！", expression: "proud", time: { kind: "stamped", at: 0 } },
      { kind: "compact-boundary" },
      {
        kind: "request",
        turnId: 1,
        text: "2つめの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
    ])
    // 仕事のメインビューには出さない（docs/chat-mode.md 4.9）。
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "request", turnId: 1, text: "2つめの依頼", images: [] },
    ])
  })

  it("依頼とセリフの記録は、そのイベントに打たれた時刻を持つ", () => {
    const events: readonly StampedEvent[] = [
      { at: 1_000, event: { kind: "request", text: "架空の依頼", images: [] } },
      { at: 2_000, event: { kind: "speech", text: "架空のセリフ", expression: "default" } },
    ]
    const view = events.reduce(
      (state, stamped) => applySessionEvent(state, stamped.event, stamped.at),
      INITIAL_SESSION_STATE,
    )

    expect(view.records.map((record) => ("time" in record ? record.time : undefined))).toEqual([
      { kind: "stamped", at: 1_000 },
      { kind: "stamped", at: 2_000 },
    ])
  })

  it("再生の終わり（history-restored）で、それまでの依頼とセリフは時刻の分からない記録になる", () => {
    const view = apply(
      { kind: "request", text: "組み直した依頼", images: [] },
      { kind: "speech", text: "組み直したセリフ", expression: "default" },
      { kind: "compact-boundary" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "history-restored" },
      { kind: "request", text: "いまの依頼", images: [] },
    )

    expect(view.records).toEqual([
      {
        kind: "request",
        turnId: 0,
        text: "組み直した依頼",
        images: [],
        time: { kind: "restored" },
      },
      {
        kind: "speech",
        text: "組み直したセリフ",
        expression: "default",
        time: { kind: "restored" },
      },
      { kind: "compact-boundary" },
      {
        kind: "request",
        turnId: 1,
        text: "いまの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
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

    const finished = applySessionEvent(
      running,
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: false },
      60_000,
    )

    // どれだけ時間が経っても（ツールが長く走っても、終わったあとも）表情は変わらない。
    expect(finished.speechExpression).toBe("proud")
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
    // 突き合わせ用。docs/display.md 4.2）。
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

  it("mainViewEntries はツール系の entry も含む（ステップの actions に入る）", () => {
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

  it("plan が届くまでは undefined、届いたらそのまま持つ（docs/glossary.md「プラン」）", () => {
    expect(INITIAL_SESSION_STATE.plan).toBeUndefined()

    const view = apply({ kind: "plan", plan: "max" })

    expect(view.plan).toBe("max")
  })

  it("セッションが終わると理由を持つ（実行中のツールを一覧から落とすのは currentTurnSteps の仕事。test/shared/turn-step.test.ts）", () => {
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
  })

  it("request でターンが進行中になり、turn-finished で止まる（入力欄の送信/中断の切り替えに使う）", () => {
    expect(INITIAL_SESSION_STATE.turn.kind).toBe("idle")

    const started = apply({ kind: "request", text: "ダミーの依頼", images: [] })
    expect(started.turn.kind).toBe("running")

    const finished = applySessionEvent(
      started,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      0,
    )
    expect(finished.turn.kind).toBe("finished")
  })

  it("turn-started はターンを始めるが、記録を1件も積まない（話しかけてもらった一言を残さない）", () => {
    const spoken = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
    )

    const started = applySessionEvent(spoken, { kind: "turn-started" }, 700)

    // 記録は前のターンのまま（送った文面はどこにも入らないので、雑談のログにも
    // メインビューにも出ようが無い。docs/screen-design.md 13.7）。
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

    const finished = applySessionEvent(
      started,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      300,
    )
    expect(finished.turn).toEqual({
      kind: "finished",
      startedAt: 100,
      finishedAt: 300,
      ending: { kind: "ended" },
    })

    // 次の依頼で0から数え直す（`running` に戻るので、終わった時刻はもう持たない）。
    const restarted = applySessionEvent(
      finished,
      { kind: "request", text: "次の依頼", images: [] },
      400,
    )
    expect(restarted.turn).toEqual({ kind: "running", startedAt: 400 })
  })

  it("lastTurnFinishedAt は turn が running に戻っても前の値のまま、次の turn-finished で進む（サイドバーの使用量の行・トークン消費の画面の取り直しの合図。受け入れの確認で見つかった不具合の再現）", () => {
    expect(INITIAL_SESSION_STATE.lastTurnFinishedAt).toBeUndefined()

    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "ダミーの依頼", images: [] },
      100,
    )
    const finished = applySessionEvent(
      started,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      300,
    )
    expect(finished.lastTurnFinishedAt).toBe(300)

    // 次のターンが始まって turn は running に戻っても、直前に終わった時刻のまま
    // （`turn.finished.finishedAt` は running の腕に無いので読めなくなるが、こちらは戻らない）。
    const restarted = applySessionEvent(
      finished,
      { kind: "request", text: "次の依頼", images: [] },
      400,
    )
    expect(restarted.turn.kind).toBe("running")
    expect(restarted.lastTurnFinishedAt).toBe(300)

    // そのターンが終わると、もう一度だけ進む。
    const finishedAgain = applySessionEvent(
      restarted,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      700,
    )
    expect(finishedAgain.lastTurnFinishedAt).toBe(700)
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

    expect(ended.turn).toEqual({
      kind: "finished",
      startedAt: 100,
      finishedAt: 250,
      ending: { kind: "ended" },
    })
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

    // 目印・最終更新時刻・見出し（見出しは作り物の文字列。docs/coding-standards.md「会話内容の扱い」）。
    const sessions = [
      { viewPort: 7328, sessionId: "s-架空-2", lastModified: 2_000, heading: "架空の見出しその2" },
      { viewPort: 7327, sessionId: "s-架空-1", lastModified: 1_000, heading: "架空の見出しその1" },
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
        sessions: [
          { viewPort: 7327, sessionId: "s-架空-新", lastModified: 0, heading: "架空の見出し" },
        ],
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

    const view = apply(characterChangedEvent(character))

    expect(view.character).toEqual(character)
  })

  it("character-changed の chatAccent（雑談中だけの accent）もそのまま持つ", () => {
    const view = apply(characterChangedEvent({ accent: "#6fe3cd", chatAccent: "#f2984a" }))

    expect(view.character?.accent).toBe("#6fe3cd")
    expect(view.character?.chatAccent).toBe("#f2984a")
  })

  it("character-changed の tagline（ひとことプロフィール）もそのまま持つ", () => {
    const view = apply(characterChangedEvent({ tagline: "架空のひとこと" }))

    expect(view.character?.tagline).toBe("架空のひとこと")
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
    // 二度と起動しなかった（`src/browser/domain/reveal/use-report-reveal.ts`）。
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      events.push({ kind: "utterance", text: `本文${String(turn)}` })
      events.push({ kind: "turn-finished", outcome: { kind: "completed" } })
    }

    const view = apply(...events)
    const turns = mainViewTurns(mainViewEntries(view), { report: false, utterance: false })

    expect(turns.at(-1)?.id).toBe(24)
    expect(turns.map((turn) => turn.id)).toEqual(
      Array.from({ length: MAX_MAIN_VIEW_TURNS }, (_, index) => 25 - MAX_MAIN_VIEW_TURNS + index),
    )
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

describe("applySessionEvent（report を書いている間）", () => {
  // 立ち絵の「書いている」の材料（`src/shared/portrait-motion.ts`）。
  const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const DRAFTING: SessionEvent = { kind: "report-drafting", toolUseId: "toolu_r1" }

  it("report-drafting で書いている途中になり、同じ呼び出しの report で下りる", () => {
    expect(apply(REQUEST, DRAFTING).reportDrafting).toEqual({
      kind: "drafting",
      toolUseId: "toolu_r1",
    })
    expect(
      apply(REQUEST, DRAFTING, {
        kind: "report",
        toolUseId: "toolu_r1",
        conclusion: "架空の結論。",
        body: "",
        favor: "",
      }).reportDrafting,
    ).toEqual({ kind: "idle" })
  })

  it("差し戻されて report が届かなくても、同じ呼び出しの tool-finished で下りる", () => {
    const finished = apply(REQUEST, DRAFTING, {
      kind: "tool-finished",
      toolUseId: "toolu_r1",
      content: "架空の差し戻し",
      isError: true,
    })

    expect(finished.reportDrafting).toEqual({ kind: "idle" })
    // report の結果はツールの記録ではないので、「失敗でびくっ」の材料にもならない。
    expect(finished.lastToolFailureAt).toBeUndefined()
  })

  it("ほかの呼び出しの tool-finished では下りない", () => {
    const other = apply(REQUEST, DRAFTING, {
      kind: "tool-finished",
      toolUseId: "toolu_other",
      content: "架空の結果",
      isError: false,
    })

    expect(other.reportDrafting.kind).toBe("drafting")
  })

  it("ターンが終わったら（中断で呼び出しが届かなくても）下りる", () => {
    expect(
      apply(REQUEST, DRAFTING, { kind: "turn-finished", outcome: { kind: "interrupted" } })
        .reportDrafting,
    ).toEqual({ kind: "idle" })
  })
})

describe("applySessionEvent（最近の話題）", () => {
  it("届くまでは空", () => {
    expect(INITIAL_SESSION_STATE.chatTopics).toEqual([])
  })

  it("chat-topics-changed で丸ごと置き換わる（継ぎ足さない）", () => {
    const view = apply(
      { kind: "chat-topics-changed", topics: ["架空の古い話題"] },
      { kind: "chat-topics-changed", topics: ["架空の新しい話題", "架空の二番目の話題"] },
    )

    expect(view.chatTopics).toEqual(["架空の新しい話題", "架空の二番目の話題"])
  })
})

describe("applySessionEvent（背景のタスク）", () => {
  const SHELL_TASK = {
    taskId: "bash-1",
    kind: "shell",
    description: "架空の待ち",
  } satisfies BackgroundTask

  it("届くまでは空", () => {
    expect(INITIAL_SESSION_STATE.backgroundTasks).toEqual([])
  })

  it("background-tasks-changed で丸ごと置き換わり、ターンが終わっても残る", () => {
    const view = apply(
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "background-tasks-changed", tasks: [SHELL_TASK] },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    )

    expect(view.turn.kind).toBe("finished")
    expect(view.backgroundTasks).toEqual([SHELL_TASK])
  })

  it("空の知らせが届くと消える", () => {
    const view = apply(
      { kind: "background-tasks-changed", tasks: [SHELL_TASK] },
      { kind: "background-tasks-changed", tasks: [] },
    )

    expect(view.backgroundTasks).toEqual([])
  })

  it("session-ended で空にする（claude のプロセスと一緒に終わる）", () => {
    const view = apply(
      { kind: "background-tasks-changed", tasks: [SHELL_TASK] },
      { kind: "session-ended", reason: "セッションが終了した" },
    )

    expect(view.backgroundTasks).toEqual([])
  })

  it("知らせのあとの続きのターン（turn-resumed）はターンを進行中に戻し、吹き出しと表情は持ち越す", () => {
    const view = apply(
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "speech", text: "架空の一言", expression: "proud" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "background-tasks-changed", tasks: [] },
      { kind: "turn-resumed" },
    )

    expect(view.turn.kind).toBe("running")
    expect(view.speeches).toEqual(["架空の一言"])
    expect(view.speechExpression).toBe("proud")
  })

  it("続きのターンのセリフは、前の SDK ターンのセリフに続けて積む", () => {
    const view = apply(
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "speech", text: "架空の一言", expression: "default" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "turn-resumed" },
      { kind: "speech", text: "架空の続き", expression: "default" },
    )

    expect(view.speeches).toEqual(["架空の一言", "架空の続き"])
  })
})

describe("applySessionEvent（覚えていること）", () => {
  it("届くまでは空", () => {
    expect(INITIAL_SESSION_STATE.rememberedLines).toEqual([])
  })

  it("remembered-lines-changed で丸ごと置き換わる（継ぎ足さない）", () => {
    const view = apply(
      { kind: "remembered-lines-changed", lines: ["架空の古い1行"] },
      { kind: "remembered-lines-changed", lines: ["架空の新しい1行", "架空の二番目の1行"] },
    )

    expect(view.rememberedLines).toEqual(["架空の新しい1行", "架空の二番目の1行"])
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

describe("applySessionEvent（見直し）", () => {
  const FINDINGS = {
    days: 7,
    headline: "架空の冒頭の一言。",
    proposals: [
      {
        kind: "tool-result",
        target: "ExampleTool",
        impact: "large",
        title: "架空の見出し",
        basis: "架空の根拠",
        action: "架空のやること",
        followUp: "task",
      },
    ],
  } as const

  /** 依頼を 100 で送り、最初の段を 300、次の段を 500 で渡した見直し中の姿。 */
  function running(): SessionState {
    const events: readonly StampedEvent[] = [
      { at: 100, event: { kind: "request", text: "架空の依頼", images: [] } },
      { at: 300, event: { kind: "usage-review-stage", stage: "model", days: 7 } },
      { at: 500, event: { kind: "usage-review-stage", stage: "cache", days: 7 } },
    ]
    return events.reduce<SessionState>(
      (state, { at, event }) => applySessionEvent(state, event, at),
      INITIAL_SESSION_STATE,
    )
  }

  it("段が届くと見直し中になり、始まりはそのターンの始まり・段はいまの段", () => {
    expect(running().usageReview).toEqual({
      kind: "running",
      startedAt: 100,
      days: 7,
      stage: "cache",
    })
  })

  it("結果が届くと結果になり、そのあとターンが終わっても結果のまま", () => {
    const result = applySessionEvent(
      running(),
      { kind: "usage-review-result", findings: FINDINGS },
      700,
    )
    const finished = applySessionEvent(
      result,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      800,
    )

    expect(finished.usageReview).toEqual({ kind: "result", reviewedAt: 700, findings: FINDINGS })
  })

  it("結果を渡さずにターンが終わるとふだんへ戻る", () => {
    const finished = applySessionEvent(
      running(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
      800,
    )

    expect(finished.usageReview).toEqual({ kind: "idle" })
  })

  it("割り込まれて（error で）ターンが終わってもふだんへ戻る", () => {
    const interrupted = applySessionEvent(
      running(),
      { kind: "turn-finished", outcome: { kind: "interrupted" } },
      800,
    )

    expect(interrupted.usageReview).toEqual({ kind: "idle" })
  })

  it("見直し中にセッションが終わってもふだんへ戻る", () => {
    const ended = applySessionEvent(running(), { kind: "session-ended", reason: "架空" }, 800)

    expect(ended.usageReview).toEqual({ kind: "idle" })
  })

  it("見直しに関わらないターンの終わりでは、ふだんのまま", () => {
    expect(
      apply(
        { kind: "request", text: "架空の依頼", images: [] },
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ).usageReview,
    ).toEqual({ kind: "idle" })
  })
})

describe("applySessionEvent（成果の振り返り）", () => {
  it("diary-requested で writing になり、段は read", () => {
    const state = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    expect(state.diaryWriting).toEqual({
      kind: "writing",
      date: "2026-09-23",
      startedAt: 100,
      stage: "read",
    })
  })

  it("diary-drafting で段が write に進む", () => {
    const requested = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    const drafting = applySessionEvent(requested, { kind: "diary-drafting", toolUseId: "t1" }, 200)
    expect(drafting.diaryWriting).toEqual({
      kind: "writing",
      date: "2026-09-23",
      startedAt: 100,
      stage: "write",
    })
  })

  it("diary-stage で段が pick に進む（段は戻らない）", () => {
    const requested = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    const drafting = applySessionEvent(requested, { kind: "diary-drafting", toolUseId: "t1" }, 200)
    const picked = applySessionEvent(drafting, { kind: "diary-stage", stage: "pick" }, 300)
    expect(picked.diaryWriting).toEqual({
      kind: "writing",
      date: "2026-09-23",
      startedAt: 100,
      stage: "pick",
    })
  })

  it("writing でなければ diary-drafting / diary-stage は姿を変えない", () => {
    const idleDrafting = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "diary-drafting", toolUseId: "t1" },
      100,
    )
    expect(idleDrafting.diaryWriting).toEqual({ kind: "idle" })
  })

  it("diary-written で written になる", () => {
    const requested = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    const written = applySessionEvent(requested, { kind: "diary-written", date: "2026-09-23" }, 400)
    expect(written.diaryWriting).toEqual({ kind: "written", date: "2026-09-23", writtenAt: 400 })
  })

  it("writing のままターンが終わると failed になる（成功・中断・失敗のどれでも）", () => {
    const requested = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    const finished = applySessionEvent(
      requested,
      { kind: "turn-finished", outcome: { kind: "interrupted" } },
      500,
    )
    expect(finished.diaryWriting).toEqual({ kind: "failed", date: "2026-09-23" })
  })

  it("written / failed のままターンが終わっても姿は変わらない", () => {
    const requested = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    const written = applySessionEvent(requested, { kind: "diary-written", date: "2026-09-23" }, 400)
    const finished = applySessionEvent(
      written,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      500,
    )
    expect(finished.diaryWriting).toEqual({ kind: "written", date: "2026-09-23", writtenAt: 400 })
  })

  it("セッションが終わると idle へ戻る", () => {
    const requested = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    const ended = applySessionEvent(requested, { kind: "session-ended", reason: "架空" }, 500)
    expect(ended.diaryWriting).toEqual({ kind: "idle" })
  })

  it("振り返りに関わらないターンの終わりでは idle のまま", () => {
    expect(
      apply(
        { kind: "request", text: "架空の依頼", images: [] },
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ).diaryWriting,
    ).toEqual({ kind: "idle" })
  })
})

describe("applySessionEvent（API の不調と失敗）", () => {
  const REQUEST = { kind: "request", text: "架空の依頼", images: [] } satisfies SessionEvent
  const RETRY = {
    kind: "api-retry",
    retry: {
      attempt: 2,
      maxRetries: 10,
      retryDelayMs: 4000,
      errorStatus: 529,
      error: "overloaded",
    },
  } satisfies SessionEvent
  const FAILED_BY_API = {
    kind: "turn-finished",
    outcome: { kind: "failed", cause: { kind: "api-error" } },
  } satisfies SessionEvent

  it("api-retry で呼び直し中になり、届いた時刻を持つ", () => {
    const state = applySessionEvent(apply(REQUEST), RETRY, 1234)

    expect(state.apiTrouble).toEqual({ kind: "retrying", at: 1234, ...RETRY.retry })
  })

  it("モデルが何かを出したら（本文・ステップの使用量など）呼び直し中を下ろす", () => {
    const outputs = [
      { kind: "partial-utterance", text: "架空の書きかけ" },
      {
        kind: "step-usage",
        messageId: "msg_1",
        scope: "main",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
    ] satisfies SessionEvent[]

    for (const output of outputs) {
      expect(apply(REQUEST, RETRY, output).apiTrouble).toEqual({ kind: "none" })
    }
  })

  it("モデルの出力でないイベント（答え待ち・使用量の累計）では呼び直し中を下ろさない", () => {
    const state = apply(
      REQUEST,
      RETRY,
      { kind: "pending-changed", pending: [] },
      { kind: "token-usage", cumulative: [] },
    )

    expect(state.apiTrouble.kind).toBe("retrying")
  })

  it("API のエラーで失敗したターンは、届いたエラーの種類を理由にして記録の末尾に積む", () => {
    const state = applySessionEvent(
      apply(REQUEST, { kind: "api-error", error: "rate_limit" }),
      FAILED_BY_API,
      500,
    )

    const failure = { kind: "api-error", error: "rate_limit" } as const
    expect(state.records.at(-1)).toEqual({ kind: "turn-failure", failure })
    expect(state.turn).toEqual({
      kind: "finished",
      startedAt: 0,
      finishedAt: 500,
      ending: { kind: "failed", failure },
    })
    expect(state.apiTrouble).toEqual({ kind: "none" })
  })

  it("呼び直しを使い切って止まったときは、最後の呼び直しの種類を理由にする", () => {
    const state = apply(REQUEST, RETRY, FAILED_BY_API)

    expect(state.records.at(-1)).toEqual({
      kind: "turn-failure",
      failure: { kind: "api-error", error: "overloaded" },
    })
  })

  it("種類が1つも届かずに API のエラーで止まったら unknown にする", () => {
    expect(apply(REQUEST, FAILED_BY_API).records.at(-1)).toEqual({
      kind: "turn-failure",
      failure: { kind: "api-error", error: "unknown" },
    })
  })

  it("API のエラーのあとにモデルが続けて完了したターンは失敗にしない（立て直した）", () => {
    const state = apply(
      REQUEST,
      { kind: "api-error", error: "max_output_tokens" },
      { kind: "utterance", text: "架空の続きの本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    )

    expect(state.records.some((record) => record.kind === "turn-failure")).toBe(false)
    expect(state.turn).toMatchObject({ kind: "finished", ending: { kind: "ended" } })
  })

  it("中断は失敗にせず、記録も積まない", () => {
    const state = apply(REQUEST, { kind: "turn-finished", outcome: { kind: "interrupted" } })

    expect(state.records.some((record) => record.kind === "turn-failure")).toBe(false)
    expect(state.turn).toMatchObject({ kind: "finished", ending: { kind: "ended" } })
  })

  it("上限の失敗は理由をそのまま積む", () => {
    const state = apply(REQUEST, {
      kind: "turn-finished",
      outcome: { kind: "failed", cause: { kind: "max-turns" } },
    })

    expect(state.records.at(-1)).toEqual({ kind: "turn-failure", failure: { kind: "max-turns" } })
  })

  it("次の依頼で呼び直し中も前のターンの失敗の印も持ち越さない（記録は残る）", () => {
    const state = apply(REQUEST, RETRY, FAILED_BY_API, REQUEST, RETRY, REQUEST)

    expect(state.apiTrouble).toEqual({ kind: "none" })
    expect(state.turn).toEqual({ kind: "running", startedAt: 0 })
    expect(state.records.filter((record) => record.kind === "turn-failure")).toHaveLength(1)
  })

  it("rate-limit-changed で利用上限を丸ごと置き換え、ターンの境目では戻さない", () => {
    const rejected = { kind: "rejected", bucket: "five-hour", resetsAt: 1_800_000_000_000 } as const
    const state = apply({ kind: "rate-limit-changed", rateLimit: rejected }, REQUEST, {
      kind: "turn-finished",
      outcome: { kind: "completed" },
    })

    expect(state.rateLimit).toEqual(rejected)
    expect(
      applySessionEvent(state, { kind: "rate-limit-changed", rateLimit: { kind: "clear" } }, 0)
        .rateLimit,
    ).toEqual({ kind: "clear" })
  })

  it("失敗の記録はメインビューのステップに入らず、やり取りの failure に移る", () => {
    const state = apply(
      REQUEST,
      { kind: "utterance", text: "架空の本文" },
      { kind: "api-error", error: "overloaded" },
      FAILED_BY_API,
    )
    const [turn] = mainViewTurns(mainViewEntries(state), { report: false, utterance: false })

    expect(turn?.failure).toEqual({
      kind: "failed",
      failure: { kind: "api-error", error: "overloaded" },
    })
    expect(turn?.steps).toHaveLength(1)
  })
})
