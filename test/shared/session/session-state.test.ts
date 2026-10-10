import { describe, expect, it } from "vitest"

import type { TaskSummaryItem } from "../../../src/shared/repository/task-summary.ts"
import type { BackgroundTask } from "../../../src/shared/session-driver/background-task.ts"
import type { DelegateReturn } from "../../../src/shared/session/delegate-return.ts"
import {
  MAX_MAIN_VIEW_TURNS,
  mainViewEntries,
  mainViewTurns,
} from "../../../src/shared/session/main-view.ts"
import type {
  RestoredEvent,
  SessionEvent,
  StampedEvent,
} from "../../../src/shared/session/session-event.ts"
import {
  applyRestoredEvents,
  applySessionEvent,
  INITIAL_SESSION_STATE,
  MAX_TOOL_TEXT_LENGTH,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import {
  latestWorkPlan,
  type WorkPlan,
  type WorkPlanClosing,
} from "../../../src/shared/session/work-plan.ts"
import {
  characterChangedEvent,
  characterInfo,
  shownOutfitAccents,
  shownPortraits,
} from "../../fixture/character.ts"
import { reportEvent } from "../../fixture/report-event.ts"

// 時刻に依らないテストでは `now` を固定の 0 で流す（時刻を見る畳み込みは
// applySessionEvent を直接呼び、進める時刻を明示する）。
function apply(...events: readonly SessionEvent[]): SessionState {
  return events.reduce((view, event) => applySessionEvent(view, event, 0), INITIAL_SESSION_STATE)
}

/**
 * `state.session` が `running`（`init` 済みで `permissionMode` も分かっている）である前提で
 * 取り出す。まだなら失敗させる。`running` という名前は他のテストがローカル変数として
 * 使っている（ツールが動いている状態の意味）ので、ここでは衝突しないよう `runningSession`
 * にする。`model` はここに無い（`SessionState.model` を直接読む。`session` の外にある
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

  it("セリフは記録にも積むが、レポート（mainViewEntries）には出さない", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "utterance", text: "ダミーのレポート" },
    )

    // 記録には残す（過去のターンの吹き出しを引き直すため。`turnSpeeches`）。
    expect(view.records).toEqual([
      {
        kind: "request",
        turnId: 0,
        text: "ダミーの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
      {
        kind: "speech",
        text: "いくよ！",
        expression: "proud",
        time: { kind: "stamped", at: 0 },
        answersAside: false,
      },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
    // メインビューにはセリフを出さない（吹き出しだけ。docs/architecture/display.md「表示」）。
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

    // 記録には積む（雑談のログ側 `chatLogRows` が読む）。
    expect(view.records).toEqual([
      {
        kind: "request",
        turnId: 0,
        text: "ダミーの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
      {
        kind: "speech",
        text: "いくよ！",
        expression: "proud",
        time: { kind: "stamped", at: 0 },
        answersAside: false,
      },
      { kind: "compact-boundary" },
      {
        kind: "request",
        turnId: 1,
        text: "2つめの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
    ])
    // 仕事のメインビューには出さない（docs/architecture/chat-mode.md「雑談モード」）。
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

  it("新しいターンの request の直後は吹き出しを空にして表情を既定に戻し、次の speak でそのターンのものだけになる", () => {
    const firstTurn = apply(
      { kind: "request", text: "1つめの依頼", images: [] },
      { kind: "speech", text: "1つめのセリフ", expression: "default" },
      { kind: "speech", text: "1つめの2つめのセリフ", expression: "proud" },
    )

    const secondTurnStarted = applySessionEvent(
      firstTurn,
      { kind: "request", text: "2つめの依頼", images: [] },
      0,
    )
    // 送信した時点で前のターンの一言は残さず空にする（次のターンに移ったことが画面から
    // 分かるように）。
    expect(secondTurnStarted.speeches).toEqual([])
    expect(secondTurnStarted.speechExpression).toBe("default")

    const secondTurnSpoken = applySessionEvent(
      secondTurnStarted,
      { kind: "speech", text: "2つめのセリフ", expression: "default" },
      0,
    )
    // 次の speak が来た時点で、そのターンのものだけになる。
    expect(secondTurnSpoken.speeches).toEqual([{ text: "2つめのセリフ", expression: "default" }])
  })

  it("ツールが動いていても表情は直前の speak のまま変わらない（自動の上書きは 2026-09-17 に撤去）", () => {
    // 表情の源は `speak` の1つだけ（docs/requirements.md「状態連動」）。ツールの開始・終了・
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
        startedAt: { kind: "stamped", at: 0 },
        status: { kind: "running" },
        backgroundEnd: { kind: "foreground" },
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
    // 突き合わせ用。docs/architecture/display.md「表示」）。
    expect(view.records).toEqual([
      {
        kind: "tool",
        toolUseId: "toolu_1",
        name: "Read",
        input: { path: "/tmp/a" },
        nested: false,
        startedAt: { kind: "stamped", at: 0 },
        status: {
          kind: "finished",
          finishedAt: { kind: "stamped", at: 0 },
          result: { kind: "failed", output: { head: "ダミーの結果", omittedLength: 0 } },
        },
        backgroundEnd: { kind: "foreground" },
      },
    ])
    // メインビューへ渡す tool の記録が持つのは名前・入力・結果だけ（描くかどうかは
    // `Turn` の仕事で、いまはツールを描かない）。
    expect(mainViewEntries(view)).toEqual([
      {
        kind: "tool",
        name: "Read",
        input: { path: "/tmp/a" },
        status: {
          kind: "finished",
          finishedAt: { kind: "stamped", at: 0 },
          result: { kind: "failed", output: { head: "ダミーの結果", omittedLength: 0 } },
        },
      },
    ])
  })

  it("上限を超える失敗の結果は、先頭の上限ぶんと落とした字数だけを記録に入れる", () => {
    const view = apply(
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Bash",
        input: {},
        parentToolUseId: undefined,
      },
      {
        kind: "tool-finished",
        toolUseId: "toolu_1",
        content: "架".repeat(MAX_TOOL_TEXT_LENGTH + 5),
        isError: true,
      },
    )

    expect(view.records[0]).toMatchObject({
      status: {
        result: {
          kind: "failed",
          output: { head: "架".repeat(MAX_TOOL_TEXT_LENGTH), omittedLength: 5 },
        },
      },
    })
  })

  it("成功した結果は本文を記録に入れず、lastToolFailureAt も変えない", () => {
    const view = apply(
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      {
        kind: "tool-finished",
        toolUseId: "toolu_1",
        content: "架".repeat(MAX_TOOL_TEXT_LENGTH + 5),
        isError: false,
      },
    )

    expect(view.records[0]).toMatchObject({ status: { result: { kind: "succeeded" } } })
    expect(view.lastToolFailureAt).toBeUndefined()
  })

  it("対応する tool_use が無い結果は、失敗でも記録に足さず lastToolFailureAt も打たない", () => {
    const view = apply({
      kind: "tool-finished",
      toolUseId: "toolu_unknown",
      content: "ダミーの結果",
      isError: true,
    })

    expect(mainViewEntries(view)).toEqual([])
    expect(view.lastToolFailureAt).toBeUndefined()
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

  it("model-effort-support はモデルごとの effort の対応をそのまま置き換える", () => {
    expect(INITIAL_SESSION_STATE.modelEffortSupport).toEqual([])

    const view = apply({
      kind: "model-effort-support",
      models: [
        { model: "opus", supportsEffort: true, effortLevels: ["low", "medium", "high"] },
        { model: "haiku", supportsEffort: false, effortLevels: [] },
      ],
    })

    expect(view.modelEffortSupport).toEqual([
      { model: "opus", supportsEffort: true, effortLevels: ["low", "medium", "high"] },
      { model: "haiku", supportsEffort: false, effortLevels: [] },
    ])
  })

  it("effort-changed は読み取った effort をそのまま置き換える。届くまでは undefined", () => {
    expect(INITIAL_SESSION_STATE.effort).toBeUndefined()

    const view = apply(
      { kind: "effort-changed", effort: "low" },
      { kind: "effort-changed", effort: "high" },
    )

    expect(view.effort).toBe("high")
  })

  it("plan が届くまでは undefined、届いたらそのまま持つ（docs/glossary.md「プラン」）", () => {
    expect(INITIAL_SESSION_STATE.plan).toBeUndefined()

    const view = apply({ kind: "plan", plan: "max" })

    expect(view.plan).toBe("max")
  })

  it("セッションが終わると理由を持つ（実行中のツールを一覧から落とすのは currentTurnSteps の仕事。test/shared/session/turn-step.test.ts）", () => {
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

  it("turn-started はターンを始めるが、記録を1件も積まない（話しかけてもらった一言を残さない）", () => {
    const spoken = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
    )

    const started = applySessionEvent(spoken, { kind: "turn-started" }, 700)

    // 記録は前のターンのまま（送った文面はどこにも入らないので、雑談のログにも
    // メインビューにも出ようが無い。docs/architecture/screen-design.md「雑談モードの画面」）。
    expect(started.records).toEqual(spoken.records)
    // ターンの始まりとしての効き目は `request` と同じ。
    expect(started.turn).toEqual({ kind: "running", startedAt: 700 })
    expect(started.speeches).toEqual([])
    expect(started.speechExpression).toBe("default")
    expect(started.speechCalledInTurn).toBe(false)
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

  it("turn-resumed は始まった時刻を付け直さない（背景のタスクを挟んだ続きのターンでも、入力欄の経過時間が依頼を送った時刻から数え続ける）", () => {
    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "背景へ委譲する依頼", images: [] },
      100,
    )
    expect(started.turn).toEqual({ kind: "running", startedAt: 100 })

    // メインが背景のタスクへ委譲してターンを終えても、背景のタスクは残ったまま
    // （`turn-finished` は `backgroundTasks` を空にしない）。
    const delegated = applySessionEvent(
      started,
      {
        kind: "background-tasks-changed",
        tasks: [{ taskId: "task-1", kind: "agent", description: "架空の委譲" }],
      },
      150,
    )
    const finished = applySessionEvent(
      delegated,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      300,
    )
    expect(finished.turn).toEqual({
      kind: "finished",
      startedAt: 100,
      finishedAt: 300,
      ending: { kind: "ended" },
    })
    expect(finished.backgroundTasks).toEqual([
      { taskId: "task-1", kind: "agent", description: "架空の委譲" },
    ])

    // 背景のタスクが終わり、claude が自分で始めた続きのターン（`turn-resumed`）が届く。
    // 起点はここで付け直さず、最初の依頼を送った時刻（100）のまま。
    const clearedBackground = applySessionEvent(
      finished,
      { kind: "background-tasks-changed", tasks: [] },
      950,
    )
    const resumed = applySessionEvent(clearedBackground, { kind: "turn-resumed" }, 1_000)
    expect(resumed.turn).toEqual({ kind: "running", startedAt: 100 })

    // その続きのターンが終わったときの所要時間も、最初の依頼からの時間になる。
    const finishedAgain = applySessionEvent(
      resumed,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      1_500,
    )
    expect(finishedAgain.turn).toEqual({
      kind: "finished",
      startedAt: 100,
      finishedAt: 1_500,
      ending: { kind: "ended" },
    })
  })

  it("aside はターンの通し番号も始まった時刻も進めず、吹き出しを空にして、そのターンのセリフに答えの印を付ける", () => {
    const delegated = [
      [{ kind: "request", text: "架空の依頼", images: [] }, 100],
      [{ kind: "speech", text: "架空の着手のセリフ", expression: "default" }, 150],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, 300],
    ] as const satisfies readonly (readonly [SessionEvent, number])[]
    const finished = delegated.reduce(
      (state, [event, at]) => applySessionEvent(state, event, at),
      INITIAL_SESSION_STATE,
    )
    const aside = applySessionEvent(
      finished,
      { kind: "aside", text: "架空の問い", images: [] },
      500,
    )

    expect(aside.nextTurnId).toBe(finished.nextTurnId)
    expect(aside.turn).toEqual({ kind: "running", startedAt: 100 })
    expect(aside.speeches).toEqual([])
    expect(aside.answeringAside).toBe(true)
    expect(aside.records.at(-1)).toEqual({
      kind: "aside",
      text: "架空の問い",
      images: [],
      time: { kind: "stamped", at: 500 },
    })

    const answered = applySessionEvent(
      aside,
      { kind: "speech", text: "架空の答え", expression: "default" },
      600,
    )
    const resumed = [
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "turn-resumed" },
      { kind: "speech", text: "架空の続きのセリフ", expression: "default" },
    ] as const satisfies readonly SessionEvent[]
    const after = resumed.reduce((state, event) => applySessionEvent(state, event, 700), answered)

    expect(
      after.records.flatMap((record) =>
        record.kind === "speech" ? [[record.text, record.answersAside]] : [],
      ),
    ).toEqual([
      ["架空の着手のセリフ", false],
      ["架空の答え", true],
      ["架空の続きのセリフ", false],
    ])
  })

  it("finishedTurnCount は turn が running に戻っても前の値のまま、次の turn-finished で進む（サイドバーの使用量の行・トークン消費の画面の取り直しの合図。受け入れの確認で見つかった不具合の再現）", () => {
    expect(INITIAL_SESSION_STATE.finishedTurnCount).toBe(0)

    // 時刻はすべて同じにする（凍らせたサーバの時計の下でもターンごとに違う値になること）。
    const at = 300
    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "ダミーの依頼", images: [] },
      at,
    )
    const finished = applySessionEvent(
      started,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      at,
    )
    expect(finished.finishedTurnCount).toBe(1)

    // 終わったあとにもう一度届いた終わりでは数えない（1ターンを二重に数えない）。
    const finishedTwice = applySessionEvent(
      finished,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      at,
    )
    expect(finishedTwice.finishedTurnCount).toBe(1)
    const endedAfterFinish = applySessionEvent(
      finishedTwice,
      { kind: "session-ended", reason: "セッションが終了した" },
      at,
    )
    expect(endedAfterFinish.finishedTurnCount).toBe(1)

    const restarted = applySessionEvent(
      finished,
      { kind: "request", text: "次の依頼", images: [] },
      at,
    )
    expect(restarted.turn.kind).toBe("running")
    expect(restarted.finishedTurnCount).toBe(1)

    const finishedAgain = applySessionEvent(
      restarted,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      at,
    )
    expect(finishedAgain.finishedTurnCount).toBe(2)
  })

  it("始まっていないターンは session-ended でも終わらない（idle のまま）", () => {
    const ended = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "session-ended", reason: "セッションが終了した" },
      250,
    )

    expect(ended.turn).toEqual({ kind: "idle" })
    expect(ended.finishedTurnCount).toBe(0)
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
      {
        kind: "welcome-greeting-changed",
        state: {
          kind: "written",
          greeting: {
            withCard: "架空の挨拶 {札}",
            withoutCard: "架空の挨拶",
            expression: "proud",
            reactions: {
              retrying: { text: "架空の再試行", expression: "default" },
              failed: { text: "架空の失敗", expression: "default" },
              limited: { text: "架空の上限", expression: "default" },
              idle: { text: "架空の待ち", expression: "default" },
            },
          },
        },
      },
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "speech", text: "架空のセリフ", expression: "proud" },
      { kind: "utterance", text: "架空のレポート" },
      { kind: "request", text: "/clear", images: [] },
    )
    // "/clear" 自体も request なので、この時点で吹き出しはすでに空（record は残る）。
    expect(before.speeches).toEqual([])
    expect(before.records.length).toBeGreaterThan(0)
    expect(before.welcomeGreeting.kind).toBe("written")

    const cleared = applySessionEvent(before, { kind: "conversation-cleared" }, 0)

    expect(cleared.speeches).toEqual([])
    expect(cleared.speechExpression).toBe("default")
    expect(cleared.speechCalledInTurn).toBe(false)
    expect(cleared.records).toEqual([])
    expect(cleared.partialUtterance).toBe("")
    // 古い挨拶を出さない（すぐ後にサーバから新しい代の `writing` が届く）。
    expect(cleared.welcomeGreeting).toEqual({ kind: "none" })
    // 画面が壊れないように、キャラクターとセッション情報は残す。
    expect(cleared.character).toEqual(before.character)
    expect(cleared.characterPacks).toEqual(before.characterPacks)
    expect(runningSession(cleared).sessionId).toBe("session-dummy")
    expect(cleared.model).toBe("claude-opus-5")
    expect(runningSession(cleared).permissionMode).toBe("auto")
    expect(cleared.slashCommands).toEqual(["clear"])
  })

  it("tasks-changed で .tw/tasks.json の一覧を持ち、届くまでは読み込み中", () => {
    expect(INITIAL_SESSION_STATE.tasks).toEqual({ kind: "loading" })

    const items: readonly TaskSummaryItem[] = [
      {
        id: "X-001",
        summary: "架空のタスク",
        status: "todo",
        dependencies: [],
        waitingFor: [],
        labels: [],
        body: "",
        location: { kind: "none" },
      },
    ]
    const known = { kind: "known", items } as const
    const withTasks = apply({ kind: "tasks-changed", tasks: known })
    expect(withTasks.tasks).toEqual(known)

    const cleared = applySessionEvent(
      withTasks,
      { kind: "tasks-changed", tasks: { kind: "unknown" } },
      0,
    )
    expect(cleared.tasks).toEqual({ kind: "unknown" })
  })

  it("sessions-changed で切り替え先の一覧を持ち、届くまでは空", () => {
    expect(INITIAL_SESSION_STATE.sessions).toEqual([])

    const sessions = [
      {
        viewPort: 7328,
        sessionId: "s-架空-2",
        lastModified: 2_000,
        startedAt: 1_500,
        heading: "架空の見出しその2",
      },
      {
        viewPort: 7327,
        sessionId: "s-架空-1",
        lastModified: 1_000,
        startedAt: 500,
        heading: "架空の見出しその1",
      },
    ]
    const listed = apply({ kind: "sessions-changed", sessions, current: "s-架空-1" })
    expect(listed.sessions).toEqual(sessions)
    // `init` を待たずに居場所が決まる（続きから始めたときだけ）。`model` / `permissionMode`
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
          {
            viewPort: 7327,
            sessionId: "s-架空-新",
            lastModified: 0,
            startedAt: 0,
            heading: "架空の見出し",
          },
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
    // 番号を位置で決めていたころは、窓（20ターン）を超えるといちばん新しいターンの番号が
    // 19 で止まり、描く側が `key` に使っているせいで部品が作り直されず、書き上げる演出が
    // 二度と起動しなかった（`useReportReveal`）。
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      events.push({ kind: "utterance", text: `本文${String(turn)}` })
      events.push({ kind: "turn-finished", outcome: { kind: "completed" } })
    }

    const view = apply(...events)
    const turns = mainViewTurns(mainViewEntries(view), { report: false, utterance: false }, true)

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
  // 立ち絵の「書いている」の材料（`resolvePortraitMotion`）。
  const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const DRAFTING: SessionEvent = { kind: "report-drafting", toolUseId: "toolu_r1" }

  it("report-drafting で書いている途中になり、同じ呼び出しの report で下りる", () => {
    expect(apply(REQUEST, DRAFTING).reportDrafting).toEqual({
      kind: "drafting",
      toolUseId: "toolu_r1",
    })
    expect(apply(REQUEST, DRAFTING, reportEvent({ toolUseId: "toolu_r1" })).reportDrafting).toEqual(
      { kind: "idle" },
    )
  })

  it("report の待ちの一言は記録に写る", () => {
    const state = apply(
      REQUEST,
      reportEvent({
        toolUseId: "toolu_r1",
        waitingLine: { kind: "speech", text: "架空の待ちの一言", expression: "bored" },
      }),
    )

    expect(state.records.at(-1)).toMatchObject({
      kind: "report",
      waitingLine: { kind: "speech", text: "架空の待ちの一言", expression: "bored" },
    })
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

  it("session-ended で空にする（claude のプロセスと一緒に終わる）", () => {
    const view = apply(
      { kind: "background-tasks-changed", tasks: [SHELL_TASK] },
      { kind: "session-ended", reason: "セッションが終了した" },
    )

    expect(view.backgroundTasks).toEqual([])
  })
})

describe("applySessionEvent（背景で走らせた Bash の終わり）", () => {
  const bashStarted = (toolUseId: string, input: unknown): SessionEvent => ({
    kind: "tool-started",
    toolUseId,
    name: "Bash",
    input,
    parentToolUseId: undefined,
  })
  const accepted = (toolUseId: string): SessionEvent => ({
    kind: "tool-finished",
    toolUseId,
    content: "架空の受付",
    isError: false,
  })
  const notified = (toolUseId: string): SessionEvent => ({
    kind: "background-tool-finished",
    toolUseId,
  })
  const applyAt = (...stamped: readonly (readonly [SessionEvent, number])[]): SessionState =>
    stamped.reduce(
      (state, [event, at]) => applySessionEvent(state, event, at),
      INITIAL_SESSION_STATE,
    )
  const backgroundEndsOf = (state: SessionState) =>
    state.records.flatMap((record) => (record.kind === "tool" ? [record.backgroundEnd] : []))

  it("run_in_background の Bash は知らせを待ち、知らせが届いた時刻を持つ（tool_result の受付は終わりにしない）", () => {
    const waiting = applyAt(
      [bashStarted("toolu_bg", { command: "架空の検査", run_in_background: true }), 1_000],
      [accepted("toolu_bg"), 1_300],
    )
    const done = applySessionEvent(waiting, notified("toolu_bg"), 9_000)

    expect(backgroundEndsOf(waiting)).toEqual([{ kind: "awaiting" }])
    expect(backgroundEndsOf(done)).toEqual([
      { kind: "notified", at: { kind: "stamped", at: 9_000 } },
    ])
  })

  it("前景の Bash・知らない id・2回目の知らせでは姿を変えない（前景でも長いと知らせが届く）", () => {
    const state = applyAt(
      [bashStarted("toolu_fg", { command: "架空の検査" }), 0],
      [notified("toolu_fg"), 4_000],
      [accepted("toolu_fg"), 4_005],
      [bashStarted("toolu_bg", { command: "架空の検査", run_in_background: true }), 5_000],
      [notified("toolu_bg"), 7_000],
      [notified("toolu_bg"), 8_000],
      [notified("toolu_unknown"), 9_000],
    )

    expect(backgroundEndsOf(state)).toEqual([
      { kind: "foreground" },
      { kind: "notified", at: { kind: "stamped", at: 7_000 } },
    ])
  })

  it("復元した記録の知らせは、読めた時刻の recovered になり、読めなければ restored になる", () => {
    const start = bashStarted("toolu_bg", { command: "架空の検査", run_in_background: true })
    const withTime = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [
        { event: start, time: { kind: "known", at: 0 } },
        { event: notified("toolu_bg"), time: { kind: "known", at: 7_000 } },
      ],
      8_000,
    )
    const withoutTime = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [
        { event: start, time: { kind: "known", at: 0 } },
        { event: notified("toolu_bg"), time: { kind: "unknown" } },
      ],
      8_000,
    )

    expect(backgroundEndsOf(withTime)).toEqual([
      { kind: "notified", at: { kind: "recovered", at: 7_000 } },
    ])
    expect(backgroundEndsOf(withoutTime)).toEqual([{ kind: "notified", at: { kind: "restored" } }])
  })
})

describe("applySessionEvent（覚えていること）", () => {
  it("remembered-lines-changed で丸ごと置き換わる（継ぎ足さない）", () => {
    const view = apply(
      { kind: "remembered-lines-changed", lines: ["架空の古い1行"] },
      { kind: "remembered-lines-changed", lines: ["架空の新しい1行", "架空の二番目の1行"] },
    )

    expect(view.rememberedLines).toEqual(["架空の新しい1行", "架空の二番目の1行"])
  })
})

describe("applySessionEvent（質問の記録）", () => {
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
        toolUseId: "toolu_q",
        questions: [singleQuestion],
        answers: [["案B"]],
        briefed: [false],
        sentBack: 0,
      },
    )

    expect(entries).toEqual([
      { kind: "question", toolUseId: "toolu_q", questions: [singleQuestion], answers: [["案B"]] },
    ])
  })

  it("複数選択の答えは1つの文字列に畳まれず、選んだぶんだけ並ぶ", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼", images: [] },
      {
        kind: "question-answered",
        toolUseId: "toolu_q",
        questions: [multiQuestion],
        answers: [["案A", "案C"]],
        briefed: [false],
        sentBack: 0,
      },
    )

    expect(entries).toEqual([
      {
        kind: "question",
        toolUseId: "toolu_q",
        questions: [multiQuestion],
        answers: [["案A", "案C"]],
      },
    ])
  })

  it("答えていない質問（pending-changed だけ）は記録に残らない", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼", images: [] },
      {
        kind: "pending-changed",
        pending: [{ kind: "question", id: "toolu_q", questions: [singleQuestion], briefs: [] }],
      },
    )

    expect(entries).toEqual([])
  })

  it("記録は前のやり取りに残り、次の依頼で消えない", () => {
    const view = apply(
      { kind: "request", text: "架空の依頼1", images: [] },
      {
        kind: "question-answered",
        toolUseId: "toolu_q",
        questions: [singleQuestion],
        answers: [["案A"]],
        briefed: [false],
        sentBack: 0,
      },
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

  it("見直しのイベントは見直しの2つの欄だけを動かし、始まりはそのターンの始まりになる", () => {
    const before = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "架空の依頼", images: [] },
      100,
    )
    const after = applySessionEvent(
      before,
      { kind: "usage-review-result", findings: FINDINGS },
      700,
    )

    expect(running().usageReview).toEqual({
      kind: "running",
      startedAt: 100,
      days: 7,
      stage: "cache",
    })
    expect({
      ...after,
      usageReview: before.usageReview,
      previousUsageReview: before.previousUsageReview,
      records: before.records,
    }).toEqual(before)
  })

  it("結果を受け付けたターンだけ、メインビューのやり取りに印が立つ", () => {
    const events: readonly SessionEvent[] = [
      { kind: "request", text: "架空の依頼1", images: [] },
      { kind: "usage-review-stage", stage: "model", days: 7 },
      { kind: "usage-review-result", findings: FINDINGS },
      reportEvent(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "request", text: "架空の依頼2", images: [] },
      reportEvent({ toolUseId: "fictional-report-2" }),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ]
    const state = apply(...events)
    const turns = mainViewTurns(mainViewEntries(state), { report: false, utterance: false }, true)

    expect(turns.map((turn) => turn.usageReviewResult)).toEqual([true, false])
    expect(turns[0]?.steps).toHaveLength(1)
  })

  it("結果を渡さずにターンが終わるとふだんへ戻る", () => {
    const finished = applySessionEvent(
      running(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
      800,
    )

    expect(finished.usageReview).toEqual({ kind: "idle" })
  })

  it("見直し中にセッションが終わってもふだんへ戻る", () => {
    const ended = applySessionEvent(running(), { kind: "session-ended", reason: "架空" }, 800)

    expect(ended.usageReview).toEqual({ kind: "idle" })
  })
})

describe("applySessionEvent（成果の振り返り）", () => {
  it("振り返りのイベントは diaryWriting だけを動かし、会話のターンが終わっても動かさない", () => {
    const before = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "架空のセリフ", expression: "proud" },
      50,
    )
    const requested = applySessionEvent(
      before,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    const finished = applySessionEvent(
      requested,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      500,
    )

    expect(requested.diaryWriting.kind).toBe("writing")
    expect({ ...requested, diaryWriting: before.diaryWriting }).toEqual(before)
    expect(finished.diaryWriting).toEqual(requested.diaryWriting)
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
})

describe("applySessionEvent（委譲と段取り）", () => {
  const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const PHASES = ["架空の計画", "架空の段1", "架空の段2", "架空の受け入れ"]
  const mainPlan = (current: number, phaseSummary = ""): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    phases: PHASES,
    current,
    finishedInGroup: [],
    phaseSummary,
  })
  const currentOf = (state: SessionState) => {
    const plan = latestWorkPlan(state.records)
    return plan.kind === "planned" ? plan.current : undefined
  }

  it("委譲先の途中の合図（SendMessage）・返却（SubagentHandback）と背景のタスクの顔ぶれの変化では、帯は動かない", () => {
    const before = apply(request, mainPlan(1, "架空のまとめ。"))
    const after = apply(
      request,
      mainPlan(1, "架空のまとめ。"),
      {
        kind: "tool-started",
        toolUseId: "toolu_send",
        name: "SendMessage",
        input: { to: "main", message: "状況 | 2/3 | 架空" },
        parentToolUseId: "toolu_sub",
      },
      {
        kind: "tool-started",
        toolUseId: "toolu_handback",
        name: "SubagentHandback",
        input: { message: "段 2/2 | 架空の返却。" },
        parentToolUseId: "toolu_sub",
      },
      { kind: "background-tasks-changed", tasks: [] },
    )

    expect(currentOf(after)).toBe(currentOf(before))
  })
})

describe("applySessionEvent（委譲の返却で進む段取り）", () => {
  const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const PHASES = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
  const plan = (current: number, delegatedRange: WorkPlan["delegatedRange"]): SessionEvent => ({
    kind: "work-plan",
    phases: PHASES,
    current,
    finishedInGroup: [],
    phaseSummary: current > 0 ? "架空のまとめ。" : "",
    delegatedRange,
  })
  const RANGE = { kind: "range", first: 1, count: 2 } as const
  const returned = (handback: DelegateReturn): SessionEvent => ({
    kind: "delegate-returned",
    handback,
  })
  const done = (phase: number, summary = "架空の要約。"): DelegateReturn => ({
    kind: "phase-done",
    phase,
    count: 2,
    summary,
  })

  it("返却の届いた時刻で、段を済ませた段取りの記録を積む", () => {
    const planned = applySessionEvent(
      applySessionEvent(INITIAL_SESSION_STATE, request, 1_000),
      plan(1, RANGE),
      2_000,
    )

    const state = applySessionEvent(planned, returned(done(1)), 9_000)

    expect(state.records.at(-1)).toMatchObject({
      kind: "work-plan",
      current: 2,
      phaseSummary: "架空の要約。",
      delegatedRange: RANGE,
      time: { kind: "stamped", at: 9_000 },
    })
  })

  it("メインが work_plan を呼ばなくても返却ごとに進み、同じ返却をもう一度受けても記録を足さない", () => {
    const state = [plan(1, RANGE), returned(done(1)), returned(done(1)), returned(done(2))].reduce(
      (view, event) => applySessionEvent(view, event, 0),
      applySessionEvent(INITIAL_SESSION_STATE, request, 0),
    )

    expect(state.records.filter((record) => record.kind === "work-plan")).toHaveLength(3)
    expect(latestWorkPlan(state.records)).toMatchObject({ current: 3 })
  })

  it.each([
    ["一足飛び", done(2)],
    ["計画", { kind: "plan", count: 2, summary: "架空" } as const],
    ["止めた", { kind: "stopped", phase: 1, count: 2, summary: "架空" } as const],
    ["形の読めない返却", { kind: "unreadable" } as const],
  ])("%s は帯を動かさない", (_, handback) => {
    const planned = [request, plan(1, RANGE)].reduce(
      (view, event) => applySessionEvent(view, event, 0),
      INITIAL_SESSION_STATE,
    )

    expect(applySessionEvent(planned, returned(handback), 5_000)).toEqual(planned)
  })

  it("範囲の無い段取りと、段取りの無い依頼では動かさない", () => {
    const noRange = apply(request, plan(1, { kind: "none" }))

    expect(applySessionEvent(noRange, returned(done(1)), 5_000)).toEqual(noRange)
    expect(applySessionEvent(apply(request), returned(done(1)), 5_000)).toEqual(apply(request))
  })

  it("前の依頼の段取りは進めない", () => {
    const state = apply(request, plan(1, RANGE), request)

    expect(applySessionEvent(state, returned(done(1)), 5_000)).toEqual(state)
  })
})

describe("applySessionEvent（report の段の閉じ方と段取り）", () => {
  const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
  const mainPlan = (current: number): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    phases: PHASES,
    current,
    finishedInGroup: [],
    phaseSummary: current > 0 && current < PHASES.length ? "架空のまとめ。" : "",
  })
  const reportOf = (workPlanClosing: WorkPlanClosing): SessionEvent =>
    reportEvent({ toolUseId: "toolu_r1", workPlanClosing })
  const currentPlan = (state: SessionState) => latestWorkPlan(state.records)

  it("最後の段で finished の report を受けると、帯が全部済みになる", () => {
    const state = apply(request, mainPlan(2), reportOf("finished"))

    expect(currentPlan(state)).toEqual({
      kind: "planned",
      phases: PHASES,
      current: PHASES.length,
      finishedInGroup: [],
      phaseSummary: "",
      delegatedRange: { kind: "none" },
    })
    expect(state.records.at(-1)?.kind).toBe("report")
  })

  it("stopped の report では、帯は今の段のまま残る", () => {
    const state = apply(request, mainPlan(2), reportOf("stopped"))

    expect(currentPlan(state)).toMatchObject({ current: 2 })
  })

  it("段が2つ以上残っていれば、finished でも帯は動かない", () => {
    const state = apply(request, mainPlan(1), reportOf("finished"))

    expect(currentPlan(state)).toMatchObject({ current: 1 })
  })

  it("段取りの無い依頼と、前の依頼の段取りには何も積まない", () => {
    const none = apply(request, reportOf("finished"))
    const previous = apply(request, mainPlan(2), request, reportOf("finished"))

    expect(none.records.filter((record) => record.kind === "work-plan")).toEqual([])
    expect(previous.records.filter((record) => record.kind === "work-plan")).toHaveLength(1)
  })
})

describe("applySessionEvent（段取りとレポートの時刻）", () => {
  const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const mainPlan = (current: number): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    phases: ["架空の計画", "架空の実装", "架空の受け入れ"],
    current,
    finishedInGroup: [],
    phaseSummary: current > 0 && current < 3 ? "架空のまとめ。" : "",
  })
  const report: SessionEvent = reportEvent({ toolUseId: "toolu_r1" })
  const applyAt = (...stamped: readonly (readonly [SessionEvent, number])[]): SessionState =>
    stamped.reduce(
      (state, [event, at]) => applySessionEvent(state, event, at),
      INITIAL_SESSION_STATE,
    )
  const timesOf = (state: SessionState) =>
    state.records.flatMap((record) =>
      record.kind === "work-plan" || record.kind === "report" ? [record.time] : [],
    )

  it("work-plan・report の記録は、届いた時刻を持つ", () => {
    const state = applyAt([request, 0], [mainPlan(0), 1000], [mainPlan(1), 2000], [report, 3000])

    expect(timesOf(state)).toEqual([
      { kind: "stamped", at: 1000 },
      { kind: "stamped", at: 2000 },
      { kind: "stamped", at: 3000 },
    ])
  })

  it("復元した段取りとレポートは、読めた時刻の recovered になり、読めなければ restored になる", () => {
    const events = [request, mainPlan(0), report]
    const withTime = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      events.map((event, index) => ({ event, time: { kind: "known", at: index * 1000 } })),
      9000,
    )
    const withoutTime = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      events.map((event) => ({ event, time: { kind: "unknown" } })),
      9000,
    )

    expect(timesOf(withTime)).toEqual([
      { kind: "recovered", at: 1000 },
      { kind: "recovered", at: 2000 },
    ])
    expect(timesOf(withoutTime)).toEqual([{ kind: "restored" }, { kind: "restored" }])
  })
})

describe("applySessionEvent（答え待ちの届いた時刻）", () => {
  const permission = (
    id: string,
  ): Extract<SessionEvent, { kind: "pending-changed" }>["pending"][number] => ({
    kind: "permission",
    id,
    toolName: "Bash",
    input: {},
  })

  it("届いた答え待ちにイベントの時刻を打ち、2件目が来ても1件目の時刻は変えない", () => {
    const first = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "pending-changed", pending: [permission("toolu_1")] },
      1_000,
    )
    const second = applySessionEvent(
      first,
      { kind: "pending-changed", pending: [permission("toolu_1"), permission("toolu_2")] },
      5_000,
    )

    expect(second.pending.map((ask) => [ask.id, ask.askedAt])).toEqual([
      ["toolu_1", 1_000],
      ["toolu_2", 5_000],
    ])
  })

  it("答えて消えた id の時刻は残さず、同じ id が来直したら新しく打つ", () => {
    const events: readonly (readonly [SessionEvent, number])[] = [
      [{ kind: "pending-changed", pending: [permission("toolu_1")] }, 1_000],
      [{ kind: "pending-changed", pending: [] }, 2_000],
      [{ kind: "pending-changed", pending: [permission("toolu_1")] }, 3_000],
    ]
    const state = events.reduce(
      (view, [event, at]) => applySessionEvent(view, event, at),
      INITIAL_SESSION_STATE,
    )

    expect(state.pending.map((ask) => ask.askedAt)).toEqual([3_000])
  })
})

describe("applyRestoredEvents（transcript の時刻）", () => {
  const known = (event: SessionEvent, at: number): RestoredEvent => ({
    event,
    time: { kind: "known", at },
  })
  const unknown = (event: SessionEvent): RestoredEvent => ({ event, time: { kind: "unknown" } })
  const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const bashStarted: SessionEvent = {
    kind: "tool-started",
    toolUseId: "toolu_1",
    name: "Bash",
    input: { command: "架空の検査" },
    parentToolUseId: undefined,
  }
  const finished: SessionEvent = {
    kind: "tool-finished",
    toolUseId: "toolu_1",
    content: "架空の結果",
    isError: false,
  }
  const toolOf = (state: SessionState) => state.records.find((found) => found.kind === "tool")

  it("時刻の読める出来事から積んだ記録は、その時刻の recovered になる", () => {
    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [known(request, 1_000), known(bashStarted, 2_000), known(finished, 5_000)],
      99_999,
    )

    expect(state.records[0]).toMatchObject({
      kind: "request",
      time: { kind: "recovered", at: 1_000 },
    })
    expect(toolOf(state)).toMatchObject({
      startedAt: { kind: "recovered", at: 2_000 },
      status: { kind: "finished", finishedAt: { kind: "recovered", at: 5_000 } },
    })
  })

  it("時刻の読めない出来事から積んだ記録は restored のまま、読めた端は recovered で残る", () => {
    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [unknown(request), known(bashStarted, 2_000), unknown(finished)],
      99_999,
    )

    expect(state.records[0]).toMatchObject({ kind: "request", time: { kind: "restored" } })
    expect(toolOf(state)).toMatchObject({
      startedAt: { kind: "recovered", at: 2_000 },
      status: { kind: "finished", finishedAt: { kind: "restored" } },
    })
  })
})
