import { describe, expect, it } from "bun:test"

import { createReportReview } from "../../../src/server/core/report-review.ts"
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
const FINISHED: SessionEvent = { kind: "turn-finished", status: "success" }

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
