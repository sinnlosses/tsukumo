import { describe, expect, it } from "vitest"

import {
  createReportReview,
  REPORT_NOTHING_NEW_REJECTION_TEXT,
  REPORT_RESEND_REJECTION_TEXT,
  type ReportReview,
} from "../../../../src/server/report/core/report-review.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

/** 逃げ道の塊1つの節（中身は架空）。 */
const sectionsOf = (markdown: string): readonly ReportSection[] => [
  { heading: "", blocks: [{ kind: "markdown", markdown, fold: "" }] },
]

const VALID: ReportDraft = {
  conclusion: "架空の結論。",
  sections: [],
  favor: "",
  checks: [],
  fileContents: new Map(),
}
const INVALID: ReportDraft = {
  conclusion: "架空の結論。",
  sections: sectionsOf("# 架空の見出し"),
  favor: "",
  checks: [],
  fileContents: new Map(),
}

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
const reportEvent = (
  toolUseId: string,
  draft: ReportDraft,
  closing: Extract<SessionEvent, { kind: "report" }>["closing"] = NO_CLOSING,
): Extract<SessionEvent, { kind: "report" }> => ({
  kind: "report",
  toolUseId,
  ...draft,
  closing,
  waitingLine: { kind: "none" },
  unknownBlockCount: 0,
  sessionSummary: undefined,
  task: { kind: "none" },
})
const report = (
  toolUseId: string,
  closing: Extract<SessionEvent, { kind: "report" }>["closing"] = NO_CLOSING,
): Extract<SessionEvent, { kind: "report" }> => reportEvent(toolUseId, VALID, closing)
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
  review.pass(reportEvent(toolUseId, draft))
  review.pass(finished(toolUseId, false))
}

/** メインが `speak` / `report` 以外のツールを呼び、結果を受け取る。 */
const runTool = (review: ReportReview, toolUseId: string): void => {
  review.pass(toolStarted(toolUseId))
  review.pass(finished(toolUseId, false))
}

describe("createReportReview の judge", () => {
  it("違反の無い report は通す", () => {
    expect(createReportReview().judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("違反のある report は、違反した条を文面にして差し戻す", () => {
    const verdict = createReportReview().judge(INVALID)

    expect(verdict.kind).toBe("rejected")
    expect(verdict.kind === "rejected" ? verdict.text : "").toContain("`#` / `##` の見出し")
  })

  it("差し戻すのは1ターンに1回まで（2回目は違反があっても通す）", () => {
    const review = createReportReview()

    expect(review.judge(INVALID).kind).toBe("rejected")
    expect(review.judge(INVALID)).toEqual({ kind: "accepted" })
    expect(review.judge(INVALID)).toEqual({ kind: "accepted" })
  })

  it("ターンの区切り（session-info / turn-finished）で回数が戻る", () => {
    const review = createReportReview()

    expect(review.judge(INVALID).kind).toBe("rejected")
    review.pass(FINISHED)
    expect(review.judge(INVALID).kind).toBe("rejected")
    review.pass(SESSION_INFO)
    expect(review.judge(INVALID).kind).toBe("rejected")
  })
})

describe("createReportReview の pass", () => {
  it("report は同じ呼び出しの結果まで預かり、差し戻されなければ結果の直前に出す", () => {
    const review = createReportReview()

    expect(review.pass(report("toolu_r1"))).toEqual([])
    expect(review.pass(finished("toolu_r1", false))).toEqual([
      report("toolu_r1"),
      finished("toolu_r1", false),
    ])
  })

  it("差し戻された（isError の）report は出さず、呼び直しの report だけを出す", () => {
    const review = createReportReview()
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
    const review = createReportReview()

    expect(review.pass(report("toolu_r1"))).toEqual([])
    expect(review.pass(FINISHED)).toEqual([report("toolu_r1"), FINISHED])
  })

  it("描いた report の締めのセリフを、結果のすぐ後ろに speech として出す", () => {
    const review = createReportReview()

    review.pass(report("toolu_r1", CLOSING))
    expect(review.pass(finished("toolu_r1", false))).toEqual([
      report("toolu_r1", CLOSING),
      finished("toolu_r1", false),
      CLOSING,
    ])
  })

  it("差し戻した report の締めのセリフは出さない", () => {
    const review = createReportReview()

    review.pass(report("toolu_r1", CLOSING))
    expect(review.pass(finished("toolu_r1", true))).toEqual([finished("toolu_r1", true)])
  })

  it("結果の届かないまま終わったターンの report は、締めのセリフも turn-finished の直前に出す", () => {
    const review = createReportReview()

    review.pass(report("toolu_r1", CLOSING))
    expect(review.pass(FINISHED)).toEqual([report("toolu_r1", CLOSING), CLOSING, FINISHED])
  })

  it("report の無い流れ（切り替えないとき）はそのまま通す", () => {
    const review = createReportReview()
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
  const OTHER: ReportDraft = {
    conclusion: "別の架空の結論。",
    sections: sectionsOf("架空の根拠。"),
    favor: "",
    checks: [],
    fileContents: new Map(),
  }

  it("このターンで描いた report と同じ引数の呼び出しは、固定の文面で差し戻す", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)

    expect(review.judge(VALID)).toEqual({ kind: "rejected", text: REPORT_RESEND_REJECTION_TEXT })
    expect(REPORT_RESEND_REJECTION_TEXT).not.toContain(VALID.conclusion)
  })

  it("前後の空白だけが違う呼び出しも送り直しとして差し戻す", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", OTHER)

    const padded = {
      conclusion: `  ${OTHER.conclusion}\n`,
      sections: sectionsOf("架空の根拠。"),
      favor: " ",
      checks: [],
      fileContents: new Map(),
    }
    expect(review.judge(padded).kind).toBe("rejected")
  })

  it("中身の違う呼び直しは通す", () => {
    const review = createReportReview()
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
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    runTool(review, "toolu_t1")

    expect(review.judge(VALID).kind).toBe("rejected")
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("規約違反の差し戻しとは別に数える（違反で差し戻して直したあとの送り直しも差し戻す）", () => {
    const review = createReportReview()

    expect(review.judge(INVALID).kind).toBe("rejected")
    draw(review, "toolu_r2", VALID)
    expect(review.judge(VALID)).toEqual({ kind: "rejected", text: REPORT_RESEND_REJECTION_TEXT })
  })

  it("送り直しを差し戻したあとも、規約違反の1回は残る", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)

    expect(review.judge(VALID).kind).toBe("rejected")
    runTool(review, "toolu_t1")
    const verdict = review.judge(INVALID)
    expect(verdict.kind === "rejected" ? verdict.text : "").toContain("`#` / `##` の見出し")
  })

  it("差し戻して描かなかった report とは比べない", () => {
    const review = createReportReview()
    review.pass(reportEvent("toolu_r1", VALID))
    review.pass(finished("toolu_r1", true))

    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("ターンの区切り（session-info / turn-finished）で描いた report を忘れる", () => {
    const review = createReportReview()
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
    const review = createReportReview()
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
  const OTHER: ReportDraft = {
    conclusion: "別の架空の結論。",
    sections: [],
    favor: "",
    checks: [],
    fileContents: new Map(),
  }
  const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const TURN_STARTED: SessionEvent = { kind: "turn-started" }
  const SPEAK_FINISHED = finished("toolu_s1", false)
  const backgroundTasks = (...taskIds: readonly string[]): SessionEvent => ({
    kind: "background-tasks-changed",
    tasks: taskIds.map((taskId) => ({ taskId, kind: "agent", description: "架空の委譲" })),
  })

  it("描いた report のあと何も届かずに別の中身の report を呼ぶと、固定の文面で差し戻す", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)

    expect(review.judge(OTHER)).toEqual({
      kind: "rejected",
      text: REPORT_NOTHING_NEW_REJECTION_TEXT,
    })
    expect(REPORT_NOTHING_NEW_REJECTION_TEXT).not.toContain(OTHER.conclusion)
  })

  it("差し戻したあとは nothingNewRejected が true になり、次のターンの頭で false に戻る", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    expect(review.nothingNewRejected()).toBe(false)

    review.judge(OTHER)
    expect(review.nothingNewRejected()).toBe(true)

    review.pass(SESSION_INFO)
    expect(review.nothingNewRejected()).toBe(false)
  })

  it("ターンをまたいでも、自分で始めたターン（依頼なし）で何も届いていなければ差し戻す", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    ;[SPEAK_FINISHED, FINISHED, SESSION_INFO].forEach((event) => review.pass(event))

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("speak の結果（tool-started の無い tool-finished）は新しい事実に数えない", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    review.pass(SPEAK_FINISHED)

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("メインのツールの結果が届いたあとの report は通す（中間レポートを落とさない）", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    runTool(review, "toolu_t1")

    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
  })

  it("サブエージェントのツールの結果は新しい事実に数えない", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    review.pass(toolStarted("toolu_t1", "toolu_agent"))
    review.pass(finished("toolu_t1", false))

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("呼んだだけで結果の届いていないツールは数えない", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    review.pass(toolStarted("toolu_t1"))

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("新しい依頼（request / turn-started）のあとの report は通す", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    ;[FINISHED, REQUEST, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })

    draw(review, "toolu_r2", OTHER)
    ;[FINISHED, TURN_STARTED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("背景のタスクが終わった（顔ぶれから消えた）あとの report は、ターンの外で届いても通す", () => {
    const review = createReportReview()
    review.pass(backgroundTasks("task_a"))
    draw(review, "toolu_r1", VALID)
    ;[FINISHED, backgroundTasks(), SESSION_INFO].forEach((event) => review.pass(event))

    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
  })

  it("背景のタスクが増えただけでは新しい事実に数えない", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    ;[FINISHED, backgroundTasks("task_a"), SESSION_INFO].forEach((event) => review.pass(event))

    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("差し戻すのは1ターンに1回まで（押し切った2回目は通す）で、次のターンで枠が戻る", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)

    expect(review.judge(OTHER).kind).toBe("rejected")
    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
    ;[FINISHED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(OTHER).kind).toBe("rejected")
  })

  it("差し戻して描かなかった report のあとでも、新しい事実の届いた印は残る", () => {
    const review = createReportReview()
    review.pass(reportEvent("toolu_r1", INVALID))
    review.pass(finished("toolu_r1", true))

    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("同じ引数の送り直しは、送り直しの文面を先に返す", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)

    expect(review.judge(VALID)).toEqual({ kind: "rejected", text: REPORT_RESEND_REJECTION_TEXT })
  })
})
