import { describe, expect, it } from "vitest"

import {
  createReportReview,
  REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT,
  REPORT_NOTHING_NEW_REJECTION_TEXT,
  REPORT_RESEND_REJECTION_TEXT,
  REPORT_FINISHED_BUT_STOPPED_REJECTION_TEXT,
  REPORT_UNANSWERED_WORK_PLAN_REJECTION_TEXT,
  REPORT_UNFINISHED_PHASES_REJECTION_TEXT,
  type ReportReview,
} from "../../../../src/server/report/core/report-review.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { ReportTask, ReportTaskOutcome } from "../../../../src/shared/report/report-task.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  NO_WORK_PLAN_STANDING,
  type WorkPlanClosing,
  type WorkPlanStanding,
} from "../../../../src/shared/session/work-plan.ts"
import { reportDraft, reportEvent } from "../../../fixture/report-event.ts"

const noPlan = (): WorkPlanStanding => NO_WORK_PLAN_STANDING

/** 逃げ道の塊1つの節（中身は架空）。 */
const sectionsOf = (markdown: string): readonly ReportSection[] => [
  { heading: "", blocks: [{ kind: "markdown", markdown, fold: "" }] },
]

const VALID: ReportDraft = reportDraft({ conclusion: "架空の結論。" })
const INVALID: ReportDraft = reportDraft({
  conclusion: "架空の結論。",
  sections: sectionsOf("# 架空の見出し"),
})

const SESSION_INFO: SessionEvent = {
  kind: "session-info",
  sessionId: "架空のセッション",
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  terminalSlashCommands: [],
}
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

const NO_CLOSING = { kind: "none" } as const
const CLOSING = { kind: "speech", text: "架空の締め", expression: "default" } as const

/** handler に届いた引数を、呼び出しをイベントに変える側と同じ形のイベントにする。 */
const reportOfDraft = (
  toolUseId: string,
  draft: ReportDraft,
  closing: Extract<SessionEvent, { kind: "report" }>["closing"] = NO_CLOSING,
): Extract<SessionEvent, { kind: "report" }> =>
  reportEvent({
    toolUseId,
    conclusion: draft.conclusion,
    sections: draft.sections,
    favor: draft.favor,
    checks: draft.checks,
    workPlanClosing: draft.workPlanClosing,
    closing,
  })
const report = (
  toolUseId: string,
  closing: Extract<SessionEvent, { kind: "report" }>["closing"] = NO_CLOSING,
): Extract<SessionEvent, { kind: "report" }> => reportOfDraft(toolUseId, VALID, closing)
const finished = (toolUseId: string, isError: boolean): SessionEvent => ({
  kind: "tool-finished",
  toolUseId,
  content: isError ? "架空の差し戻し" : "ok",
  isError,
})
const toolStarted = (
  toolUseId: string,
  parentToolUseId: string | undefined = undefined,
): SessionEvent => ({
  kind: "tool-started",
  toolUseId,
  name: "Read",
  input: {},
  parentToolUseId,
})

/** `report` を handler で通して描かせる（pass に呼び出しと結果を流す）。 */
const draw = (review: ReportReview, toolUseId: string, draft: ReportDraft): void => {
  expect(review.judge(draft)).toEqual({ kind: "accepted" })
  review.pass(reportOfDraft(toolUseId, draft))
  review.pass(finished(toolUseId, false))
}

/** メインが `speak` / `report` 以外のツールを呼び、結果を受け取る。 */
const runTool = (review: ReportReview, toolUseId: string): void => {
  review.pass(toolStarted(toolUseId))
  review.pass(finished(toolUseId, false))
}

describe("createReportReview の judge", () => {
  it("違反の無い report は通す", () => {
    expect(createReportReview(noPlan).judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("違反のある report は、違反した条を文面にして差し戻す", () => {
    const verdict = createReportReview(noPlan).judge(INVALID)

    expect(verdict.kind).toBe("rejected")
    expect(verdict.kind === "rejected" ? verdict.text : "").toContain("`#` / `##` の見出し")
  })

  it("差し戻すのは1ターンに1回まで（2回目は違反があっても通す）", () => {
    const review = createReportReview(noPlan)

    expect(review.judge(INVALID).kind).toBe("rejected")
    expect(review.judge(INVALID)).toEqual({ kind: "accepted" })
    expect(review.judge(INVALID)).toEqual({ kind: "accepted" })
  })

  it("ターンの区切り（session-info / turn-finished）で回数が戻る", () => {
    const review = createReportReview(noPlan)

    expect(review.judge(INVALID).kind).toBe("rejected")
    review.pass(FINISHED)
    expect(review.judge(INVALID).kind).toBe("rejected")
    review.pass(SESSION_INFO)
    expect(review.judge(INVALID).kind).toBe("rejected")
  })
})

describe("createReportReview の pass", () => {
  it("report は同じ呼び出しの結果まで預かり、差し戻されなければ結果の直前に出す", () => {
    const review = createReportReview(noPlan)

    expect(review.pass(report("toolu_r1"))).toEqual([])
    expect(review.pass(finished("toolu_r1", false))).toEqual([
      report("toolu_r1"),
      finished("toolu_r1", false),
    ])
  })

  it("差し戻された（isError の）report は出さず、呼び直しの report だけを出す", () => {
    const review = createReportReview(noPlan)
    const passed = [
      report("toolu_r1"),
      finished("toolu_r1", true),
      report("toolu_r2"),
      finished("toolu_r2", false),
      FINISHED,
    ].flatMap((event) => review.pass(event))

    expect(passed.filter((event) => event.kind === "report")).toEqual([report("toolu_r2")])
  })

  it("結果の届かないまま終わったターンの report は、turn-finished の直前に出す", () => {
    const review = createReportReview(noPlan)

    expect(review.pass(report("toolu_r1"))).toEqual([])
    expect(review.pass(FINISHED)).toEqual([report("toolu_r1"), FINISHED])
  })

  it("描いた report の締めのセリフを、結果のすぐ後ろに speech として出す", () => {
    const review = createReportReview(noPlan)

    review.pass(report("toolu_r1", CLOSING))
    expect(review.pass(finished("toolu_r1", false))).toEqual([
      report("toolu_r1", CLOSING),
      finished("toolu_r1", false),
      CLOSING,
    ])
  })

  it("差し戻した report の締めのセリフは出さない", () => {
    const review = createReportReview(noPlan)

    review.pass(report("toolu_r1", CLOSING))
    expect(review.pass(finished("toolu_r1", true))).toEqual([finished("toolu_r1", true)])
  })

  it("結果の届かないまま終わったターンの report は、締めのセリフも turn-finished の直前に出す", () => {
    const review = createReportReview(noPlan)

    review.pass(report("toolu_r1", CLOSING))
    expect(review.pass(FINISHED)).toEqual([report("toolu_r1", CLOSING), CLOSING, FINISHED])
  })

  it("report の無い流れ（切り替えないとき）はそのまま通す", () => {
    const review = createReportReview(noPlan)
    const events: readonly SessionEvent[] = [
      SESSION_INFO,
      { kind: "utterance", text: "架空の本文" },
      {
        kind: "tool-started",
        toolUseId: "toolu_t1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      finished("toolu_t1", false),
      { kind: "speech", text: "架空の締め", expression: "default" },
      FINISHED,
    ]

    expect(events.flatMap((event) => review.pass(event))).toEqual([...events])
  })
})

describe("createReportReview の judge（送り直し）", () => {
  const OTHER: ReportDraft = reportDraft({
    conclusion: "別の架空の結論。",
    sections: sectionsOf("架空の根拠。"),
  })

  it("このターンで描いた report と同じ引数の呼び出しは、固定の文面で差し戻す", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)

    expect(review.judge(VALID)).toEqual({
      kind: "rejected",
      text: REPORT_RESEND_REJECTION_TEXT,
      reasons: ["resend"],
    })
    expect(REPORT_RESEND_REJECTION_TEXT).not.toContain(VALID.conclusion)
  })

  it("前後の空白だけが違う呼び出しも送り直しとして差し戻す", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", OTHER)

    const padded: ReportDraft = reportDraft({
      conclusion: `  ${OTHER.conclusion}\n`,
      sections: sectionsOf("架空の根拠。"),
      favor: " ",
    })
    expect(review.judge(padded).kind).toBe("rejected")
  })

  it("中身の違う呼び直しは通す", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    runTool(review, "toolu_t1")

    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
    expect(review.judge({ ...VALID, favor: "架空のお願い。" })).toEqual({ kind: "accepted" })
    expect(
      review.judge({
        ...VALID,
        checks: [{ status: "ng", label: "架空の検査", figure: "", command: "", detail: "" }],
      }),
    ).toEqual({ kind: "accepted" })
  })

  it("送り直しを差し戻すのは1ターンに1回まで（2回目の送り直しは通す）", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    runTool(review, "toolu_t1")

    expect(review.judge(VALID).kind).toBe("rejected")
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("規約違反の差し戻しとは別に数える（違反で差し戻して直したあとの送り直しも差し戻す）", () => {
    const review = createReportReview(noPlan)

    expect(review.judge(INVALID).kind).toBe("rejected")
    draw(review, "toolu_r2", VALID)
    expect(review.judge(VALID)).toMatchObject({ kind: "rejected", reasons: ["resend"] })
  })

  it("送り直しを差し戻したあとも、規約違反の1回は残る", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)

    expect(review.judge(VALID).kind).toBe("rejected")
    runTool(review, "toolu_t1")
    const verdict = review.judge(INVALID)
    expect(verdict.kind === "rejected" ? verdict.text : "").toContain("`#` / `##` の見出し")
  })

  it("差し戻して描かなかった report とは比べない", () => {
    const review = createReportReview(noPlan)
    review.pass(reportOfDraft("toolu_r1", VALID))
    review.pass(finished("toolu_r1", true))

    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("ターンの区切り（session-info / turn-finished）で描いた report を忘れる", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    runTool(review, "toolu_t1")
    review.pass(FINISHED)
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })

    draw(review, "toolu_r2", OTHER)
    runTool(review, "toolu_t2")
    review.pass(SESSION_INFO)
    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
  })

  it("report の来ない流れ（切り替えないとき）では、同じ引数の呼び出しを差し戻さない", () => {
    const review = createReportReview(noPlan)
    const events: readonly SessionEvent[] = [
      SESSION_INFO,
      { kind: "utterance", text: "架空の本文" },
      { kind: "speech", text: "架空の締め", expression: "default" },
    ]

    expect(events.flatMap((event) => review.pass(event))).toEqual([...events])
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })
})

describe("createReportReview の judge（新しい事実の無い report）", () => {
  const OTHER: ReportDraft = reportDraft({ conclusion: "別の架空の結論。" })
  const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const TURN_STARTED: SessionEvent = { kind: "turn-started" }
  const SPEAK_FINISHED = finished("toolu_s1", false)
  const backgroundTasks = (...taskIds: readonly string[]): SessionEvent => ({
    kind: "background-tasks-changed",
    tasks: taskIds.map((taskId) => ({ taskId, kind: "agent", description: "架空の委譲" })),
  })

  it("描いた report のあと何も届かずに別の中身の report を呼ぶと、固定の文面で差し戻す", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)

    expect(review.judge(OTHER)).toEqual({
      kind: "rejected",
      text: REPORT_NOTHING_NEW_REJECTION_TEXT,
      reasons: ["nothing-new"],
    })
    expect(REPORT_NOTHING_NEW_REJECTION_TEXT).not.toContain(OTHER.conclusion)
  })

  it("差し戻したあとは nothingNewRejected が true になり、次のターンの頭で false に戻る", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    expect(review.nothingNewRejected()).toBe(false)

    review.judge(OTHER)
    expect(review.nothingNewRejected()).toBe(true)

    review.pass(SESSION_INFO)
    expect(review.nothingNewRejected()).toBe(false)
  })

  it("ターンをまたいでも、自分で始めたターン（依頼なし）で何も届いていなければ差し戻す", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    ;[SPEAK_FINISHED, FINISHED, SESSION_INFO].forEach((event) => review.pass(event))

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("speak の結果（tool-started の無い tool-finished）は新しい事実に数えない", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    review.pass(SPEAK_FINISHED)

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("メインのツールの結果が届いたあとの report は通す（中間レポートを落とさない）", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    runTool(review, "toolu_t1")

    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
  })

  it("サブエージェントのツールの結果は新しい事実に数えない", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    review.pass(toolStarted("toolu_t1", "toolu_agent"))
    review.pass(finished("toolu_t1", false))

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("呼んだだけで結果の届いていないツールは数えない", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    review.pass(toolStarted("toolu_t1"))

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("新しい依頼（request / turn-started）のあとの report は通す", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    ;[FINISHED, REQUEST, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })

    draw(review, "toolu_r2", OTHER)
    ;[FINISHED, TURN_STARTED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("背景のタスクが終わった（顔ぶれから消えた）あとの report は、ターンの外で届いても通す", () => {
    const review = createReportReview(noPlan)
    review.pass(backgroundTasks("task_a"))
    draw(review, "toolu_r1", VALID)
    ;[FINISHED, backgroundTasks(), SESSION_INFO].forEach((event) => review.pass(event))

    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
  })

  it("背景のタスクが増えただけでは新しい事実に数えない", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)
    ;[FINISHED, backgroundTasks("task_a"), SESSION_INFO].forEach((event) => review.pass(event))

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("差し戻すのは1ターンに1回まで（押し切った2回目は通す）で、次のターンで枠が戻る", () => {
    const review = createReportReview(noPlan)
    draw(review, "toolu_r1", VALID)

    expect(review.judge(OTHER).kind).toBe("rejected")
    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
    ;[FINISHED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("差し戻して描かなかった report のあとでも、新しい事実の届いた印は残る", () => {
    const review = createReportReview(noPlan)
    review.pass(reportOfDraft("toolu_r1", INVALID))
    review.pass(finished("toolu_r1", true))

    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })
})

describe("createReportReview の judge（段取りの残った report）", () => {
  const taskOf = (outcome: ReportTaskOutcome): ReportTask => ({
    kind: "task",
    id: "架空のタスク",
    name: "架空の作業",
    outcome,
  })
  const withTask = (outcome: ReportTaskOutcome, workPlanClosing: WorkPlanClosing): ReportDraft => ({
    ...VALID,
    task: taskOf(outcome),
    workPlanClosing,
  })
  const closing = (workPlanClosing: WorkPlanClosing): ReportDraft => ({ ...VALID, workPlanClosing })
  /** 立ち位置を差し替えられる `ReportReview`。 */
  const reviewWith = (initial: WorkPlanStanding) => {
    let standing = initial
    return {
      review: createReportReview(() => standing),
      moveTo: (next: WorkPlanStanding) => {
        standing = next
      },
    }
  }

  it("応えていない work_plan の差し戻しがあれば差し戻し、応えたあとなら通す", () => {
    const { review, moveTo } = reviewWith({ kind: "rejected" })

    expect(review.judge(VALID)).toEqual({
      kind: "rejected",
      text: REPORT_UNANSWERED_WORK_PLAN_REJECTION_TEXT,
      reasons: ["unanswered-work-plan"],
    })
    moveTo({ kind: "planned", remaining: 1 })
    expect(review.judge(closing("finished"))).toEqual({ kind: "accepted" })
  })

  it("段取りがあって段の閉じ方の欄が無ければ差し戻す（全部済みのあとでも）", () => {
    for (const remaining of [2, 1, 0]) {
      expect(reviewWith({ kind: "planned", remaining }).review.judge(VALID)).toEqual({
        kind: "rejected",
        text: REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT,
        reasons: ["missing-work-plan-closing"],
      })
    }
  })

  it("段取りの無い依頼では、欄が無くてもあっても通す", () => {
    for (const workPlanClosing of ["none", "finished", "stopped"] as const) {
      expect(createReportReview(noPlan).judge(closing(workPlanClosing))).toEqual({
        kind: "accepted",
      })
    }
  })

  it("finished で段が2つ以上残っていれば差し戻し、最後の段か全部済みなら通す", () => {
    expect(reviewWith({ kind: "planned", remaining: 2 }).review.judge(closing("finished"))).toEqual(
      {
        kind: "rejected",
        text: REPORT_UNFINISHED_PHASES_REJECTION_TEXT,
        reasons: ["unfinished-phases"],
      },
    )
    for (const remaining of [1, 0]) {
      expect(reviewWith({ kind: "planned", remaining }).review.judge(closing("finished"))).toEqual({
        kind: "accepted",
      })
    }
  })

  it("stopped は段が残っていても通す（タスクが stopped・awaiting-answer でも、タスクが無くても）", () => {
    const { review } = reviewWith({ kind: "planned", remaining: 2 })

    expect(review.judge(closing("stopped"))).toEqual({ kind: "accepted" })
    expect(review.judge(withTask("stopped", "stopped"))).toEqual({ kind: "accepted" })
    expect(review.judge(withTask("awaiting-answer", "stopped"))).toEqual({ kind: "accepted" })
  })

  it("タスクが finished なのに stopped で段が残っていれば差し戻し、全部済みなら通す", () => {
    expect(
      reviewWith({ kind: "planned", remaining: 1 }).review.judge(withTask("finished", "stopped")),
    ).toEqual({
      kind: "rejected",
      text: REPORT_FINISHED_BUT_STOPPED_REJECTION_TEXT,
      reasons: ["finished-but-stopped"],
    })
    expect(
      reviewWith({ kind: "planned", remaining: 0 }).review.judge(withTask("finished", "stopped")),
    ).toEqual({ kind: "accepted" })
    expect(
      reviewWith({ kind: "planned", remaining: 1 }).review.judge(withTask("finished", "finished")),
    ).toEqual({ kind: "accepted" })
  })

  it("段の閉じ方の枠は1ターンに1回で、規約違反の枠とは別に数え、次のターンで戻る", () => {
    const { review } = reviewWith({ kind: "planned", remaining: 2 })

    expect(review.judge(INVALID)).toEqual({
      kind: "rejected",
      text: REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT,
      reasons: ["missing-work-plan-closing"],
    })
    expect(review.judge({ ...INVALID, workPlanClosing: "finished" }).kind).toBe("rejected")
    expect(review.judge({ ...INVALID, workPlanClosing: "finished" })).toEqual({
      kind: "accepted",
    })
    ;[FINISHED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(closing("finished"))).toEqual({
      kind: "rejected",
      text: REPORT_UNFINISHED_PHASES_REJECTION_TEXT,
      reasons: ["unfinished-phases"],
    })
  })

  it("脇の話のターンでは、段取りがあっても段の閉じ方の欄が無いことで差し戻さず、ターンが終われば戻る", () => {
    const { review } = reviewWith({ kind: "planned", remaining: 2 })
    const aside: SessionEvent = { kind: "aside", text: "架空の問い", images: [] }

    ;[aside, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })

    ;[FINISHED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge({ ...VALID, conclusion: "架空の別の結論。" })).toEqual({
      kind: "rejected",
      text: REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT,
      reasons: ["missing-work-plan-closing"],
    })
  })
})

describe("createReportReview の judge（差し戻しの種類）", () => {
  it("記法の違反は、当たった違反の種類を重複無しで持つ（文面も本文も入らない）", () => {
    const verdict = createReportReview(noPlan).judge(INVALID)

    expect(verdict.kind === "rejected" ? verdict.reasons : []).toEqual(["markdown-notation"])
    expect(JSON.stringify(verdict.kind === "rejected" ? verdict.reasons : [])).not.toContain("架空")
  })

  it("手続きの差し戻しは、その種類の名前を1つ持つ", () => {
    const resend = createReportReview(noPlan)
    draw(resend, "toolu_r1", VALID)
    expect(resend.judge(VALID)).toMatchObject({ reasons: ["resend"] })

    const nothingNew = createReportReview(noPlan)
    draw(nothingNew, "toolu_r1", VALID)
    expect(nothingNew.judge(reportDraft({ conclusion: "架空の別の結論。" }))).toMatchObject({
      reasons: ["nothing-new"],
    })

    expect(createReportReview(() => ({ kind: "rejected" })).judge(VALID)).toMatchObject({
      reasons: ["unanswered-work-plan"],
    })
    expect(
      createReportReview(() => ({ kind: "planned", remaining: 1 })).judge(
        reportDraft({
          conclusion: "架空の結論。",
          task: { kind: "task", id: "架空", name: "架空", outcome: "finished" },
          workPlanClosing: "stopped",
        }),
      ),
    ).toMatchObject({ reasons: ["finished-but-stopped"] })
  })
})
