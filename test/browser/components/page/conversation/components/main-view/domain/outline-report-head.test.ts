import { describe, expect, it } from "vitest"

import {
  outlineReportHeadOf,
  REPORT_STEP_ATTRIBUTE,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/outline-report-head.ts"

function contentWithSteps(count: number): {
  readonly content: HTMLElement
  readonly steps: readonly HTMLElement[]
} {
  const content = document.createElement("div")
  const steps = Array.from({ length: count }, () => {
    const step = document.createElement("section")
    step.setAttribute(REPORT_STEP_ATTRIBUTE, "")
    content.append(step)
    return step
  })
  return { content, steps }
}

describe("outlineReportHeadOf", () => {
  it("最終レポートがあるやり取りでは最初の札を返す", () => {
    const { content, steps } = contentWithSteps(3)

    expect(outlineReportHeadOf(content, true)).toBe(steps[0])
  })

  it("最終レポートが無いやり取りでは最後の札を返す", () => {
    const { content, steps } = contentWithSteps(3)

    expect(outlineReportHeadOf(content, false)).toBe(steps[2])
  })

  it("本文の札が無ければ本文の器そのものを返す", () => {
    const { content } = contentWithSteps(0)

    expect(outlineReportHeadOf(content, true)).toBe(content)
    expect(outlineReportHeadOf(content, false)).toBe(content)
  })

  it("畳んだ中間レポート（札の印が付かない）は数えない", () => {
    const { content, steps } = contentWithSteps(1)
    const folded = document.createElement("details")
    content.append(folded)

    expect(outlineReportHeadOf(content, false)).toBe(steps[0])
  })
})
