import { describe, expect, it } from "bun:test"

import {
  createReportReview,
  REPORT_RESEND_REJECTION_TEXT,
  type ReportReview,
} from "../../../src/server/core/report-review.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"

// レポートの文面はどれも作り物（docs/coding-standards.md「会話内容の扱い」）。

const VALID = { conclusion: "架空の結論。", body: "", favor: "" }
const INVALID = { conclusion: "架空の結論。", body: "# 架空の見出し", favor: "" }

const SESSION_INFO: SessionEvent = {
  kind: "session-info",
  sessionId: "架空のセッション",
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  terminalSlashCommands: [],
}
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

const report = (toolUseId: string): Extract<SessionEvent, { kind: "report" }> => ({
  kind: "report",
  toolUseId,
  ...VALID,
})
const finished = (toolUseId: string, isError: boolean): SessionEvent => ({
  kind: "tool-finished",
  toolUseId,
  content: isError ? "架空の差し戻し" : "ok",
  isError,
})

describe("createReportReview の judge", () => {
  it("違反の無い report は通す", () => {
    expect(createReportReview().judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("違反のある report は、違反した条を文面にして差し戻す", () => {
    const verdict = createReportReview().judge(INVALID)

    expect(verdict.kind).toBe("rejected")
    expect(verdict.kind === "rejected" ? verdict.text : "").toContain("`#` の見出しがある")
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
  const OTHER = { conclusion: "別の架空の結論。", body: "架空の根拠。", favor: "" }

  /** `report` を handler で通して描かせる（pass に呼び出しと結果を流す）。 */
  const draw = (review: ReportReview, toolUseId: string, draft: typeof VALID): void => {
    expect(review.judge(draft)).toEqual({ kind: "accepted" })
    review.pass({ kind: "report", toolUseId, ...draft })
    review.pass(finished(toolUseId, false))
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

    const padded = { conclusion: `  ${OTHER.conclusion}\n`, body: `\n${OTHER.body}  `, favor: " " }
    expect(review.judge(padded).kind).toBe("rejected")
  })

  it("中身の違う呼び直しは通す", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)

    expect(review.judge(OTHER)).toEqual({ kind: "accepted" })
    expect(review.judge({ ...VALID, favor: "架空のお願い。" })).toEqual({ kind: "accepted" })
  })

  it("送り直しを差し戻すのは1ターンに1回まで（2回目の送り直しは通す）", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)

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
    const verdict = review.judge(INVALID)
    expect(verdict.kind === "rejected" ? verdict.text : "").toContain("`#` の見出しがある")
  })

  it("差し戻して描かなかった report とは比べない", () => {
    const review = createReportReview()
    review.pass({ kind: "report", toolUseId: "toolu_r1", ...VALID })
    review.pass(finished("toolu_r1", true))

    expect(review.judge(VALID)).toEqual({ kind: "accepted" })
  })

  it("ターンの区切り（session-info / turn-finished）で描いた report を忘れる", () => {
    const review = createReportReview()
    draw(review, "toolu_r1", VALID)
    review.pass(FINISHED)
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })

    draw(review, "toolu_r2", OTHER)
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
