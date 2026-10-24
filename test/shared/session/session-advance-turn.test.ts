import { describe, expect, it } from "vitest"

import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { answeringAsideOf, reportDraftingOf } from "../../../src/shared/session/turn-progress.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"
import { apply } from "../../fixture/session-state.ts"

describe("applySessionEvent", () => {
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
    const spoken = apply(requestEvent("ダミーの依頼"), {
      kind: "speech",
      text: "いくよ！",
      expression: "proud",
    })

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

    const started = applySessionEvent(INITIAL_SESSION_STATE, requestEvent("ダミーの依頼"), 100)
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
    const restarted = applySessionEvent(finished, requestEvent("次の依頼"), 400)
    expect(restarted.turn).toEqual({ kind: "running", startedAt: 400 })
  })

  it("turn-resumed は始まった時刻を付け直さない（バックグラウンドタスクを挟んだ続きのターンでも、入力欄の経過時間が依頼を送った時刻から数え続ける）", () => {
    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      requestEvent("背景へ委譲する依頼"),
      100,
    )
    expect(started.turn).toEqual({ kind: "running", startedAt: 100 })

    // メインがバックグラウンドタスクへ委譲してターンを終えても、バックグラウンドタスクは残ったまま
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

    // バックグラウンドタスクが終わり、claude が自分で始めた続きのターン（`turn-resumed`）が届く。
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
      [requestEvent(), 100],
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
    expect(answeringAsideOf(aside.sdkTurn)).toBe(true)
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
    const started = applySessionEvent(INITIAL_SESSION_STATE, requestEvent("ダミーの依頼"), at)
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

    const restarted = applySessionEvent(finished, requestEvent("次の依頼"), at)
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
    const started = applySessionEvent(INITIAL_SESSION_STATE, requestEvent("ダミーの依頼"), 100)

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
})

describe("applySessionEvent（report を書いている間）", () => {
  // 立ち絵の「書いている」の材料（`resolvePortraitMotion`）。
  const REQUEST = requestEvent()
  const DRAFTING: SessionEvent = { kind: "report-drafting", toolUseId: "toolu_r1" }

  it("report-drafting で書いている途中になり、同じ呼び出しの report で下りる", () => {
    expect(reportDraftingOf(apply(REQUEST, DRAFTING).sdkTurn)).toEqual({
      kind: "drafting",
      toolUseId: "toolu_r1",
    })
    expect(
      reportDraftingOf(apply(REQUEST, DRAFTING, reportEvent({ toolUseId: "toolu_r1" })).sdkTurn),
    ).toEqual({ kind: "idle" })
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

    expect(reportDraftingOf(finished.sdkTurn)).toEqual({ kind: "idle" })
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

    expect(reportDraftingOf(other.sdkTurn).kind).toBe("drafting")
  })

  it("ターンが終わったら（中断で呼び出しが届かなくても）下りる", () => {
    expect(
      reportDraftingOf(
        apply(REQUEST, DRAFTING, { kind: "turn-finished", outcome: { kind: "interrupted" } })
          .sdkTurn,
      ),
    ).toEqual({ kind: "idle" })
  })
})
