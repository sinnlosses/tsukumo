import { describe, expect, it } from "vitest"

import {
  outlineReportHeadOf,
  REPORT_STEP_ATTRIBUTE,
  REPORT_STEP_FINAL_VALUE,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/outline-report-head.ts"

function stepOf(tag: "section" | "details", value: string): HTMLElement {
  const step = document.createElement(tag)
  step.setAttribute(REPORT_STEP_ATTRIBUTE, value)
  return step
}

function contentOf(...steps: readonly HTMLElement[]): HTMLElement {
  const content = document.createElement("div")
  content.append(...steps)
  return content
}

describe("outlineReportHeadOf", () => {
  it("最終レポートがあるやり取りでは最終の札を返す（前に中間の札があっても）", () => {
    const interim = stepOf("details", "")
    const final = stepOf("section", REPORT_STEP_FINAL_VALUE)

    expect(outlineReportHeadOf(contentOf(interim, final), true)).toBe(final)
  })

  it("最終レポートが無いやり取りでは最後の札を返す（中間の <details> も札）", () => {
    const first = stepOf("details", "")
    const last = stepOf("details", "")

    expect(outlineReportHeadOf(contentOf(first, last), false)).toBe(last)
  })

  it("本文の札が無ければ本文の器そのものを返す", () => {
    const content = contentOf()

    expect(outlineReportHeadOf(content, true)).toBe(content)
    expect(outlineReportHeadOf(content, false)).toBe(content)
  })

  it("札の印が付かない <details> は数えない", () => {
    const step = stepOf("section", "")
    const content = contentOf(step, document.createElement("details"))

    expect(outlineReportHeadOf(content, false)).toBe(step)
  })
})
