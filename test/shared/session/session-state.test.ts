import { describe, expect, it } from "vitest"

import type { WrittenReactions } from "../../../src/shared/recommendation/reaction.ts"
import type { TaskSummaryItem } from "../../../src/shared/repository/task-summary.ts"
import {
  MAX_MAIN_VIEW_TURNS,
  mainViewEntries,
  mainViewTurns,
} from "../../../src/shared/session/main-view.ts"
import type { SessionEvent, StampedEvent } from "../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  MAX_TOOL_TEXT_LENGTH,
} from "../../../src/shared/session/session-state.ts"
import { characterChangedEvent, characterInfo, shownPortraits } from "../../fixture/character.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { apply, runningSession, sessionIdOf } from "../../fixture/session-state.ts"

/** 架空のキャラクターパックが決まったところ。 */
const CHARACTER_FIXTURE: SessionEvent = characterChangedEvent()

const WRITTEN_REACTIONS = {
  retrying: { text: "架空の再試行", expression: "default" },
  failed: { text: "架空の失敗", expression: "default" },
  limited: { text: "架空の上限", expression: "default" },
  idle: { text: "架空の待ち", expression: "default" },
} as const satisfies WrittenReactions

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

  it("speech イベントの時刻（at）が state.speeches の要素にも載る", () => {
    const state = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "いくよ！", expression: "proud" },
      1234,
    )

    expect(state.speeches).toEqual([
      { text: "いくよ！", expression: "proud", time: { kind: "stamped", at: 1234 } },
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
    expect(secondTurnSpoken.speeches).toEqual([
      { text: "2つめのセリフ", expression: "default", time: { kind: "stamped", at: 0 } },
    ])
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

  it("aside はターンの通し番号も始まった時刻も進めず、吹き出しを残して答えを後ろに足し、そのターンのセリフに答えの印を付ける", () => {
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
    expect(aside.speeches).toEqual(finished.speeches)
    expect(aside.speeches).toHaveLength(1)
    expect(aside.speechCalledInTurn).toBe(false)
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
    expect(answered.speeches.map((speech) => speech.text)).toEqual([
      "架空の着手のセリフ",
      "架空の答え",
    ])
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
          },
        },
      },
      { kind: "reactions-written", reactions: WRITTEN_REACTIONS },
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
    // 反応の行は代につき1回だけ書くので、`/clear` では消さない。
    expect(cleared.writtenReactions).toEqual({ kind: "written", reactions: WRITTEN_REACTIONS })
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
        difficulty: undefined,
        loopable: undefined,
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
        worktree: "fictional-tree",
        inCurrentWorktree: true,
      },
      {
        viewPort: 7327,
        sessionId: "s-架空-1",
        lastModified: 1_000,
        startedAt: 500,
        heading: "架空の見出しその1",
        worktree: "fictional-tree",
        inCurrentWorktree: true,
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
            worktree: "fictional-tree",
            inCurrentWorktree: true,
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
