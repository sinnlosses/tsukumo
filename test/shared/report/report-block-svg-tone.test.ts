import { describe, expect, it } from "vitest"

import { parseReportSections } from "../../../src/shared/report/report-block.ts"

describe("svg の塊の tone・legend・dashed", () => {
  const rect = { kind: "rect", x: 10, y: 10, width: 100, height: 40 }
  const line = { kind: "line", x1: 0, y1: 0, x2: 50, y2: 50 }
  const svg = { kind: "svg", width: 200, height: 100, shapes: [rect, line] }
  const legend = [{ tone: "a", label: "層" }]
  const parse = (block: object) =>
    parseReportSections([{ heading: "", shapeTag: "unspecified", blocks: [block] }]).sections

  it("rect の tone は a〜e と none だけ、legend の tone は a〜e だけを読む", () => {
    expect(parse({ ...svg, legend, shapes: [{ ...rect, tone: "e" }] })).toHaveLength(1)
    expect(parse({ ...svg, shapes: [{ ...rect, tone: "f" }] })).toHaveLength(0)
    expect(parse({ ...svg, legend: [{ tone: "none", label: "層" }] })).toHaveLength(0)
  })

  it("line の dashed は真偽値、tone は a〜e と none だけを読む", () => {
    expect(parse({ ...svg, legend, shapes: [{ ...line, dashed: true, tone: "a" }] })).toHaveLength(
      1,
    )
    expect(parse({ ...svg, shapes: [{ ...line, dashed: "yes" }] })).toHaveLength(0)
    expect(parse({ ...svg, shapes: [{ ...line, tone: "f" }] })).toHaveLength(0)
  })
})
