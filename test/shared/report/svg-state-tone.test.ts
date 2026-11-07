import { describe, expect, it } from "vitest"

import {
  compareSideSchema,
  graphBlockSchema,
  svgBlockSchema,
} from "../../../src/shared/report/report-block-diagram.ts"

const shapes = (tone: string) => [
  { kind: "rect", x: 0, y: 0, width: 10, height: 10, tone },
  { kind: "line", x1: 0, y1: 0, x2: 10, y2: 10, tone },
]

describe("Svg の状態の tone", () => {
  it.each(["ok", "warn", "ng"])(
    "Svg と Compare の svg の rect・line と凡例が %s を受ける",
    (tone) => {
      const body = {
        width: 100,
        height: 100,
        shapes: shapes(tone),
        legend: [{ tone, label: "状態" }],
      }
      expect(svgBlockSchema.safeParse({ kind: "svg", ...body }).success).toBe(true)
      expect(compareSideSchema.safeParse({ kind: "svg", ...body }).success).toBe(true)
    },
  )

  it("Graph の凡例は状態の語を受けず、a〜e は受ける", () => {
    const graph = (tone: string) =>
      graphBlockSchema.safeParse({
        kind: "graph",
        direction: "TD",
        source: "A -> B",
        legend: [{ tone, label: "層" }],
      }).success
    expect(graph("ok")).toBe(false)
    expect(graph("a")).toBe(true)
    expect(graph("e")).toBe(true)
  })
})
