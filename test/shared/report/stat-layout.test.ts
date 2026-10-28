import { describe, expect, it } from "vitest"

import { statLayoutOf } from "../../../src/shared/report/stat-layout.ts"
import { statItem } from "../../fixture/report-markdown.ts"

describe("statLayoutOf", () => {
  it.each([
    ["up", "5", "8", "better"],
    ["up", "8", "5", "worse"],
    ["down", "8", "5", "better"],
    ["down", "5", "8", "worse"],
    ["up", "5", "5", "plain"],
    ["", "5", "8", "plain"],
    ["up", "約5", "8", "plain"],
  ] as const)("better=%s の前 %s → %s は %s", (better, before, value, tone) => {
    expect(statLayoutOf({ ...statItem, better, before, value }).beforeTone).toBe(tone)
  })

  it("折れ線は 3 点から出し、最大が上・最新の点が末尾になる", () => {
    const layout = statLayoutOf({ ...statItem, series: [1, 3, 2] })

    expect(layout.spark).toEqual({
      kind: "line",
      points: [
        { x: 1.5, y: 10.5 },
        { x: 24, y: 1.5 },
        { x: 46.5, y: 6 },
      ],
      last: { x: 46.5, y: 6 },
    })
  })

  it("折れ線は 2 点では出さず、全部同じ値なら中央に引く", () => {
    expect(statLayoutOf({ ...statItem, series: [1, 2] }).spark).toEqual({ kind: "none" })
    const flat = statLayoutOf({ ...statItem, series: [4, 4, 4] }).spark
    expect(flat.kind === "line" ? flat.points.map(({ y }) => y) : []).toEqual([6, 6, 6])
  })

  it("入れた点の数だけ折れ線の点が残る", () => {
    const series = [1, 5, 2, 8, 3]
    const spark = statLayoutOf({ ...statItem, series }).spark

    expect(spark.kind === "line" ? spark.points.length : 0).toBe(series.length)
  })

  it.each([
    ["3", "12", 25],
    ["12", "12", 100],
    ["13", "12", undefined],
    ["3", "0", undefined],
    ["3", "", undefined],
    ["約3", "12", undefined],
  ] as const)("帯は %s / %s で %s", (value, total, percent) => {
    expect(statLayoutOf({ ...statItem, value, total }).meter).toEqual(
      percent === undefined ? { kind: "none" } : { kind: "meter", percent },
    )
  })
})
