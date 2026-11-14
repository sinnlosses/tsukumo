import { describe, expect, it } from "vitest"

import type { ReportCheck } from "../../../../../src/shared/report/report-check.ts"
import { reportDraft, reportEvent } from "../../../../fixture/report-event.ts"
import { createReportReview, noPlan, SESSION_INFO } from "../../../../fixture/report-review.ts"
import { checkedToolUseId } from "../../../../fixture/tool-use-id.ts"

const okCheck = (command: string): ReportCheck => ({
  status: "ok",
  label: "架空の確認",
  figure: "",
  command,
  detail: "",
  howToVerify: "",
})

function countedReasonsAfter(bashCommands: readonly string[], command: string): readonly string[] {
  const review = createReportReview(noPlan)
  review.pass(SESSION_INFO)
  bashCommands.forEach((bash, index) => {
    review.pass({
      kind: "tool-started",
      toolUseId: checkedToolUseId(`toolu_b${index}`),
      name: "Bash",
      input: { command: bash },
    })
  })
  const draft = reportDraft({ conclusion: "架空の結論。", checks: [okCheck(command)] })
  expect(review.judge(draft)).toEqual({ kind: "accepted" })
  review.pass(
    reportEvent({ toolUseId: "toolu_r1", conclusion: draft.conclusion, checks: draft.checks }),
  )
  const passed = review.pass({
    kind: "tool-finished",
    toolUseId: checkedToolUseId("toolu_r1"),
    content: "ok",
    isError: false,
  })
  const counted = passed.find((event) => event.kind === "report-counted")
  return counted?.kind === "report-counted" ? counted.reasons : []
}

describe("打っていない command の ok の行", () => {
  it("そのターンに打った Bash と同じ command の行は数えない", () => {
    expect(countedReasonsAfter(["架空の確認コマンド"], "架空の確認コマンド")).toEqual([])
  })

  it("打っていない command の行は差し戻さず、記録に名前を残す", () => {
    expect(countedReasonsAfter(["別の架空のコマンド"], "架空の確認コマンド")).toEqual([
      "unrun-check-command",
    ])
  })

  it("command が空白だけの行は数えない", () => {
    expect(countedReasonsAfter([], "  ")).toEqual([])
  })
})
