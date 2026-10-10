import { describe, expect, it } from "vitest"

import { REPORT_NOTHING_NEW_REJECTION_TEXT } from "../../../../src/server/report/core/report-review.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import { SPEECH_NOTHING_NEW_REJECTION_TEXT } from "../../../../src/server/session-driver/core/speech-review.ts"
import type { BackgroundTask } from "../../../../src/shared/session-driver/background-task.ts"
import { parseDelegateReturn } from "../../../../src/shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportDraft, reportEvent } from "../../../fixture/report-event.ts"

type SpeechEvent = Extract<SessionEvent, { kind: "speech" }>
type ReportCalled = Extract<SessionEvent, { kind: "report" }>

const SESSION_INFO: SessionEvent = {
  kind: "session-info",
  sessionId: "架空のセッション",
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  terminalSlashCommands: [],
}
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const TURN_STARTED: SessionEvent = { kind: "turn-started" }
const ASIDE: SessionEvent = { kind: "aside", text: "架空の問い", images: [] }
const SPEECH_REJECTED = { kind: "rejected", text: SPEECH_NOTHING_NEW_REJECTION_TEXT } as const

const speechOf = (text: string): SpeechEvent => ({ kind: "speech", text, expression: "default" })
const speakCalled = (toolUseId: string, text: string): SessionEvent => ({
  kind: "speak-called",
  toolUseId,
  speech: speechOf(text),
})
const finished = (toolUseId: string, isError: boolean): SessionEvent => ({
  kind: "tool-finished",
  toolUseId,
  content: isError ? "架空の差し戻し" : "ok",
  isError,
})
const toolStarted = (toolUseId: string, parentToolUseId?: string): SessionEvent => ({
  kind: "tool-started",
  toolUseId,
  name: "Bash",
  input: {},
  parentToolUseId,
})
const backgroundTask = (taskId: string, kind: BackgroundTask["kind"]): BackgroundTask => ({
  taskId,
  kind,
  description: "架空の背景",
})
const tasksChanged = (...tasks: readonly BackgroundTask[]): SessionEvent => ({
  kind: "background-tasks-changed",
  tasks,
})

const VALID: ReportDraft = reportDraft({ conclusion: "架空の結論。" })
const OTHER: ReportDraft = reportDraft({ conclusion: "別の架空の結論。" })
const NO_CLOSING = { kind: "none" } as const
const CLOSING = { kind: "speech", text: "架空の締め", expression: "default" } as const

const reportOfDraft = (
  toolUseId: string,
  draft: ReportDraft,
  closing: ReportCalled["closing"] = NO_CLOSING,
): ReportCalled =>
  reportEvent({
    toolUseId,
    conclusion: draft.conclusion,
    sections: draft.sections,
    favor: draft.favor,
    checks: draft.checks,
    workPlanClosing: draft.workPlanClosing,
    closing,
  })

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
const planInput = (current: number) => ({
  phases: PHASES,
  current,
  phaseSummary: current > 0 ? "架空のまとめ。" : "",
})
const planCalled = (toolUseId: string, current: number): SessionEvent => ({
  kind: "work-plan-called",
  toolUseId,
  plan: {
    delegatedRange: { kind: "none" },
    phases: PHASES,
    current,
    finishedInGroup: [],
    phaseSummary: current > 0 ? "架空のまとめ。" : "",
  },
})
const planOf = (current: number): SessionEvent => {
  const called = planCalled("unused", current)
  return called.kind === "work-plan-called" ? { kind: "work-plan", ...called.plan } : called
}

/** handler の判定から結果まで、本物の駆動と同じ順に流す。`pass` が流したイベントを返す。 */
function speak(review: CallReview, toolUseId: string, text: string): readonly SessionEvent[] {
  const verdict = review.judgeSpeak()
  return [
    ...review.pass(speakCalled(toolUseId, text)),
    ...review.pass(finished(toolUseId, verdict.kind === "rejected")),
  ]
}

/** `report` を handler で通して描かせる。 */
function drawReport(review: CallReview, toolUseId: string, draft: ReportDraft): void {
  expect(review.judgeReport(draft)).toEqual({ kind: "accepted" })
  review.pass(reportOfDraft(toolUseId, draft))
  review.pass(finished(toolUseId, false))
}

/** メインが `speak` / `report` 以外のツールを呼び、結果を受け取る。 */
function runMainTool(review: CallReview, toolUseId: string): void {
  review.pass(toolStarted(toolUseId))
  review.pass(finished(toolUseId, false))
}

const isSpeechRejected = (review: CallReview): boolean => review.judgeSpeak().kind === "rejected"
const isReportRejectedForNothingNew = (review: CallReview, draft: ReportDraft): boolean => {
  const verdict = review.judgeReport(draft)
  return verdict.kind === "rejected" && verdict.reasons.includes("nothing-new")
}

describe("CallReview の預かり（speak）", () => {
  it("セッションの頭の speak は通り、セリフが結果の直前に出る", () => {
    const review = createCallReview()

    expect(speak(review, "toolu_s1", "架空のセリフ1")).toEqual([
      speechOf("架空のセリフ1"),
      finished("toolu_s1", false),
    ])
  })

  it("差し戻された speak は描かれず、結果だけが流れる", () => {
    const review = createCallReview()
    speak(review, "toolu_s1", "架空のセリフ1")

    expect(review.judgeSpeak()).toEqual(SPEECH_REJECTED)
    expect(review.pass(speakCalled("toolu_s2", "架空のセリフ2"))).toEqual([])
    expect(review.pass(finished("toolu_s2", true))).toEqual([finished("toolu_s2", true)])
  })

  it("預かったまま結果の届かなかった speak は、turn-finished の直前に出る", () => {
    const review = createCallReview()
    review.pass(speakCalled("toolu_s1", "架空のセリフ1"))

    expect(review.pass(FINISHED)).toEqual([speechOf("架空のセリフ1"), FINISHED])
    expect(review.pass(FINISHED)).toEqual([FINISHED])
  })
})

describe("CallReview の預かり（report）", () => {
  it("report は同じ呼び出しの結果まで預かり、差し戻されなければ結果の直前に出す", () => {
    const review = createCallReview()
    const report = reportOfDraft("toolu_r1", VALID)

    expect(review.pass(report)).toEqual([])
    expect(review.pass(finished("toolu_r1", false))).toEqual([report, finished("toolu_r1", false)])
  })

  it("差し戻された（isError の）report は出さず、呼び直しの report だけを出す", () => {
    const review = createCallReview()
    const passed = [
      reportOfDraft("toolu_r1", VALID),
      finished("toolu_r1", true),
      reportOfDraft("toolu_r2", VALID),
      finished("toolu_r2", false),
      FINISHED,
    ].flatMap((event) => review.pass(event))

    expect(passed.filter((event) => event.kind === "report")).toEqual([
      reportOfDraft("toolu_r2", VALID),
    ])
  })

  it("結果の届かないまま終わったターンの report は、締めのセリフも turn-finished の直前に出す", () => {
    const review = createCallReview()
    const report = reportOfDraft("toolu_r1", VALID, CLOSING)

    expect(review.pass(report)).toEqual([])
    expect(review.pass(FINISHED)).toEqual([report, CLOSING, FINISHED])
  })

  it("描いた report の締めのセリフを結果のすぐ後ろに出し、差し戻した report の締めは出さない", () => {
    const review = createCallReview()
    const report = reportOfDraft("toolu_r1", VALID, CLOSING)

    review.pass(report)
    expect(review.pass(finished("toolu_r1", false))).toEqual([
      report,
      finished("toolu_r1", false),
      CLOSING,
    ])

    review.pass(reportOfDraft("toolu_r2", OTHER, CLOSING))
    expect(review.pass(finished("toolu_r2", true))).toEqual([finished("toolu_r2", true)])
  })

  it("speak と report の無い流れはそのまま通る", () => {
    const review = createCallReview()
    const events: readonly SessionEvent[] = [
      SESSION_INFO,
      { kind: "utterance", text: "架空の本文" },
      toolStarted("toolu_t1"),
      finished("toolu_t1", false),
      speechOf("架空の締め"),
      FINISHED,
    ]

    expect(events.flatMap((event) => review.pass(event))).toEqual([...events])
  })
})

describe("CallReview の預かり（work_plan）", () => {
  it("呼び出しは結果まで預かり、差し戻されたものは捨て、通ったものだけを結果の直前に出す", () => {
    const review = createCallReview()

    expect(review.pass(planCalled("toolu_a", 2))).toEqual([])
    expect(review.pass(finished("toolu_a", true))).toEqual([finished("toolu_a", true)])
    expect(review.pass(planCalled("toolu_b", 1))).toEqual([])
    expect(review.pass(finished("toolu_b", false))).toEqual([planOf(1), finished("toolu_b", false)])
  })

  it("結果の届かないままターンが終わった呼び出しは、終わりの直前に出す", () => {
    const review = createCallReview()

    review.pass(planCalled("toolu_a", 0))

    expect(review.pass(FINISHED)).toEqual([planOf(0), FINISHED])
  })
})

describe("CallReview の順番", () => {
  it("結果の届かないままターンが終わると、セリフ → レポート → 段取りの順に turn-finished の直前に出る", () => {
    const review = createCallReview()
    const report = reportOfDraft("toolu_r1", VALID)

    review.pass(planCalled("toolu_p1", 0))
    review.pass(report)
    review.pass(speakCalled("toolu_s1", "架空のセリフ"))

    expect(review.pass(FINISHED)).toEqual([speechOf("架空のセリフ"), report, planOf(0), FINISHED])
  })

  it("差し戻した work_plan に応えるまで、report を差し戻す", () => {
    const review = createCallReview()

    expect(review.judgeWorkPlan({}).kind).toBe("malformed")
    expect(review.judgeReport(VALID)).toMatchObject({
      kind: "rejected",
      reasons: ["unanswered-work-plan"],
    })

    expect(review.judgeWorkPlan(planInput(0)).kind).toBe("accepted")
    expect(review.judgeReport(VALID)).toMatchObject({
      kind: "rejected",
      reasons: ["missing-work-plan-closing"],
    })
  })
})

describe("CallReview の新しい事実（speak）", () => {
  it("描いたセリフのあと何も届かずに呼んだ speak は、新しいことが無いまま何回でも差し戻される", () => {
    const review = createCallReview()
    speak(review, "toolu_s1", "架空のセリフ1")

    const spoken = ["toolu_s2", "toolu_s3", "toolu_s4"].flatMap((id) =>
      speak(review, id, "架空の待っているセリフ"),
    )

    expect(spoken.filter((event) => event.kind === "speech")).toEqual([])
    expect(review.judgeSpeak()).toEqual(SPEECH_REJECTED)
  })

  it("あいだにメインのツールの完了を挟めば通る", () => {
    const review = createCallReview()
    speak(review, "toolu_s1", "架空のセリフ1")
    runMainTool(review, "toolu_bash")

    expect(speak(review, "toolu_s2", "架空のセリフ2")).toContainEqual(speechOf("架空のセリフ2"))
  })

  it("依頼・ターンの始まり・ターンの頭・背景のタスクの終わりのあとも通る", () => {
    const openings: readonly SessionEvent[] = [REQUEST, TURN_STARTED, SESSION_INFO, tasksChanged()]

    for (const opening of openings) {
      const review = createCallReview()
      review.pass(tasksChanged(backgroundTask("task_1", "agent")))
      speak(review, "toolu_s1", "架空のセリフ1")
      review.pass(opening)

      expect(review.judgeSpeak()).toEqual({ kind: "accepted" })
    }
  })

  it("サブエージェントのツールの完了・呼んだだけのツール・背景のタスクが増えただけは数えない", () => {
    const review = createCallReview()
    speak(review, "toolu_s1", "架空のセリフ1")

    review.pass(toolStarted("toolu_sub_bash", "toolu_agent"))
    review.pass(finished("toolu_sub_bash", false))
    review.pass(toolStarted("toolu_unfinished"))
    review.pass(tasksChanged(backgroundTask("task_1", "agent")))

    expect(review.judgeSpeak()).toEqual(SPEECH_REJECTED)
  })
})

describe("CallReview の新しい事実（report）", () => {
  it("描いた report のあと何も届かずに別の中身の report を呼ぶと、固定の文面で差し戻す", () => {
    const review = createCallReview()
    drawReport(review, "toolu_r1", VALID)

    expect(review.judgeReport(OTHER)).toEqual({
      kind: "rejected",
      text: REPORT_NOTHING_NEW_REJECTION_TEXT,
      reasons: ["nothing-new"],
    })
  })

  it("差し戻したあとは nothingNewRejected が true になり、次のターンの頭で false に戻る", () => {
    const review = createCallReview()
    drawReport(review, "toolu_r1", VALID)
    expect(review.nothingNewRejected()).toBe(false)

    review.judgeReport(OTHER)
    expect(review.nothingNewRejected()).toBe(true)

    review.pass(SESSION_INFO)
    expect(review.nothingNewRejected()).toBe(false)
  })

  it("ターンをまたいでも、自分で始めたターン（依頼なし）で何も届いていなければ差し戻す", () => {
    const review = createCallReview()
    drawReport(review, "toolu_r1", VALID)
    review.pass(finished("toolu_s1", false))
    review.pass(FINISHED)
    review.pass(SESSION_INFO)

    expect(isReportRejectedForNothingNew(review, OTHER)).toBe(true)
  })

  it("メインのツールの結果が届いたあとの report は通す（中間レポートを落とさない）", () => {
    const review = createCallReview()
    drawReport(review, "toolu_r1", VALID)
    runMainTool(review, "toolu_t1")

    expect(review.judgeReport(OTHER)).toEqual({ kind: "accepted" })
  })

  it("サブエージェントのツールの結果・呼んだだけのツール・speak の結果は数えない", () => {
    const review = createCallReview()
    drawReport(review, "toolu_r1", VALID)

    review.pass(toolStarted("toolu_t1", "toolu_agent"))
    review.pass(finished("toolu_t1", false))
    review.pass(toolStarted("toolu_t2"))
    review.pass(finished("toolu_speak", false))

    expect(isReportRejectedForNothingNew(review, OTHER)).toBe(true)
  })

  it("新しい依頼（request / turn-started）のあとの report は通す", () => {
    for (const opening of [REQUEST, TURN_STARTED]) {
      const review = createCallReview()
      drawReport(review, "toolu_r1", VALID)
      ;[FINISHED, opening, SESSION_INFO].forEach((event) => review.pass(event))

      expect(review.judgeReport(OTHER)).toEqual({ kind: "accepted" })
    }
  })

  it("背景のタスクが終わった（顔ぶれから消えた）あとの report は、ターンの外で届いても通す", () => {
    const review = createCallReview()
    review.pass(tasksChanged(backgroundTask("task_a", "agent")))
    drawReport(review, "toolu_r1", VALID)
    ;[FINISHED, tasksChanged(), SESSION_INFO].forEach((event) => review.pass(event))

    expect(review.judgeReport(OTHER)).toEqual({ kind: "accepted" })
  })

  it("背景のタスクが増えただけでは新しい事実に数えない", () => {
    const review = createCallReview()
    drawReport(review, "toolu_r1", VALID)
    ;[FINISHED, tasksChanged(backgroundTask("task_a", "agent")), SESSION_INFO].forEach((event) =>
      review.pass(event),
    )

    expect(isReportRejectedForNothingNew(review, OTHER)).toBe(true)
  })

  it("差し戻すのは1ターンに1回まで（押し切った2回目は通す）で、次のターンで枠が戻る", () => {
    const review = createCallReview()
    drawReport(review, "toolu_r1", VALID)

    expect(isReportRejectedForNothingNew(review, OTHER)).toBe(true)
    expect(review.judgeReport(OTHER)).toEqual({ kind: "accepted" })
    ;[FINISHED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(isReportRejectedForNothingNew(review, OTHER)).toBe(true)
  })

  it("差し戻して描かなかった report のあとでも、新しい事実の届いた印は残る", () => {
    const review = createCallReview()
    review.pass(reportOfDraft("toolu_r1", VALID))
    review.pass(finished("toolu_r1", true))

    expect(review.judgeReport(OTHER)).toEqual({ kind: "accepted" })
  })

  it("session-ended のあとは背景のシェルの顔ぶれが空に戻って通す", () => {
    const review = createCallReview()
    review.pass(tasksChanged(backgroundTask("task_a", "shell")))
    review.pass({ kind: "session-ended", reason: "架空の終わり" })

    expect(review.judgeReport(VALID)).toEqual({ kind: "accepted" })
  })
})

describe("CallReview の新しい事実の数え方の差", () => {
  it("session-info は speak だけが新しい事実に数える", () => {
    const review = createCallReview()
    speak(review, "toolu_s1", "架空のセリフ1")
    drawReport(review, "toolu_r1", VALID)

    review.pass(SESSION_INFO)

    expect(isSpeechRejected(review)).toBe(false)
    expect(isReportRejectedForNothingNew(review, OTHER)).toBe(true)
  })

  it("aside は report だけが新しい事実に数える", () => {
    const review = createCallReview()
    speak(review, "toolu_s1", "架空のセリフ1")
    drawReport(review, "toolu_r1", VALID)

    review.pass(ASIDE)

    expect(isSpeechRejected(review)).toBe(true)
    expect(review.judgeReport(OTHER)).toEqual({ kind: "accepted" })
  })

  it("request・メインのツールの完了・背景のタスクの終わりは両方が数える", () => {
    const events: readonly (readonly SessionEvent[])[] = [
      [REQUEST],
      [toolStarted("toolu_t1"), finished("toolu_t1", false)],
      [tasksChanged()],
    ]

    for (const arrived of events) {
      const review = createCallReview()
      review.pass(tasksChanged(backgroundTask("task_a", "agent")))
      speak(review, "toolu_s1", "架空のセリフ1")
      drawReport(review, "toolu_r1", VALID)
      arrived.forEach((event) => review.pass(event))

      expect(isSpeechRejected(review)).toBe(false)
      expect(isReportRejectedForNothingNew(review, OTHER)).toBe(false)
    }
  })

  it("speak と report は、それぞれ自分の描いたあとからを数える", () => {
    const review = createCallReview()
    speak(review, "toolu_s1", "架空のセリフ1")
    runMainTool(review, "toolu_t1")
    drawReport(review, "toolu_r1", VALID)

    expect(isSpeechRejected(review)).toBe(false)
    expect(isReportRejectedForNothingNew(review, OTHER)).toBe(true)
  })
})

describe("CallReview の関門の印", () => {
  const FOUR = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
  const SUMMARY = "架空のまとめ。"
  const ranged = (current: number, phaseSummary = "") => ({
    phases: FOUR,
    current,
    phaseSummary,
    delegatedRange: { first: 1, count: 2 },
  })
  const handback = (message: string): SessionEvent => ({
    kind: "delegate-returned",
    handback: parseDelegateReturn(message),
  })
  const started = (): CallReview => {
    const review = createCallReview()
    review.pass(REQUEST)
    review.judgeWorkPlan(ranged(0))
    review.judgeWorkPlan(ranged(1, SUMMARY))
    return review
  }

  it("段取りを受け付けた依頼で返却が届くと立ち、形の読めない返却・止めた・一足飛びでも立つ", () => {
    for (const message of [
      "段 1/2 | 架空の返却。",
      "了解しました",
      "止めた 1/2 | 架空の理由。",
      "段 2/2 | 架空の一足飛び。",
    ]) {
      const review = started()
      review.pass(handback(message))
      expect(review.gateRaised()).toBe(true)
    }
  })

  it("段取りを受け付けていない依頼の返却では立たない", () => {
    const review = createCallReview()
    review.pass(REQUEST)

    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.gateRaised()).toBe(false)
  })

  it("受け付けた work_plan で下り、差し戻された work_plan では下りない", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.judgeWorkPlan(ranged(3)).kind).toBe("malformed")
    expect(review.gateRaised()).toBe(true)
    expect(review.judgeWorkPlan(ranged(2)).kind).toBe("accepted")
    expect(review.gateRaised()).toBe(false)
  })

  it("続けて届いた返却も、1回の work_plan で下りる", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))
    review.pass(handback("段 2/2 | 架空の返却。"))

    expect(review.judgeWorkPlan(ranged(3, SUMMARY)).kind).toBe("accepted")
    expect(review.gateRaised()).toBe(false)
  })

  it("止めた返却は、同じ位置のまま work_plan を呼べば下りる", () => {
    const review = started()
    review.pass(handback("止めた 1/2 | 架空の理由。"))

    expect(review.judgeWorkPlan(ranged(1, SUMMARY)).kind).toBe("accepted")
    expect(review.gateRaised()).toBe(false)
  })

  it("次の依頼で下りる", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))

    review.pass(REQUEST)

    expect(review.gateRaised()).toBe(false)
  })
})
