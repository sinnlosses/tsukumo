import { describe, expect, it } from "vitest"

import { scatterLayoutOf } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/scatter-layout.ts"

type Point = readonly [x: number, y: number, label: string, outlier?: boolean]

const spec = (points: readonly Point[]) => ({
  kind: "scatter" as const,
  title: "架空の題",
  xName: "件数",
  yName: "分",
  points: points.map(([x, y, label, outlier]) => ({ x, y, label, outlier: outlier === true })),
})

describe("scatterLayoutOf", () => {
  it("全部同じ値の点でも軸に幅を持たせ、点を枠の内に置く", () => {
    const layout = scatterLayoutOf(
      spec([
        [5, 5, ""],
        [5, 5, ""],
      ]),
    )
    for (const dot of layout.dots) {
      expect(dot.at).toBeGreaterThan(layout.minAt)
      expect(dot.at).toBeLessThan(layout.maxAt)
      expect(dot.y).toBeGreaterThan(layout.plotTop)
      expect(dot.y).toBeLessThan(layout.plotBottom)
    }
  })

  it("外れ値 1 点は名前を出し、長い名前は 18 字で切る", () => {
    const layout = scatterLayoutOf(
      spec([
        [1, 1, "a"],
        [2, 2, "b"],
        [90, 90, "あ".repeat(30), true],
      ]),
    )
    expect(layout.outliers).toHaveLength(1)
    expect([...(layout.outliers[0]?.text ?? "")]).toHaveLength(18)
    expect(layout.outliers[0]?.anchor).toBe("end")
    expect(layout.omitted).toBe(0)
  })

  it("外れ値が 4 点以上なら名前は 3 つまでで、残りは数にまとめ、名前の縦位置は重ならない", () => {
    const names = ["甲", "乙", "丙", "丁", "戊"]
    const layout = scatterLayoutOf(
      spec([[1, 1, "x"], ...names.map((name, i): Point => [50 + i, 50, name, true])]),
    )
    expect(layout.outliers).toHaveLength(5)
    expect(layout.outliers.map((outlier) => outlier.text)).toEqual(["甲", "乙", "丙", "", ""])
    expect(layout.omitted).toBe(2)
    const ys = layout.outliers.slice(0, 3).map((outlier) => outlier.textY)
    expect(new Set(ys).size).toBe(3)
  })

  it("名前が外れていない点と重なっても、外れ値の印がある点だけを外れ値として描く", () => {
    const layout = scatterLayoutOf(
      spec([
        [1, 1, "同じ"],
        [2, 2, "同じ"],
        [90, 90, "同じ", true],
      ]),
    )
    expect(layout.dots).toHaveLength(2)
    expect(layout.outliers).toHaveLength(1)
    expect(layout.outliers[0]?.text).toBe("同じ")
    expect(layout.omitted).toBe(0)
  })

  it("外れ値の名前が空でも外れ値として描き、数にも入れる", () => {
    const layout = scatterLayoutOf(
      spec([
        [1, 1, "a"],
        [90, 90, "", true],
        ...[91, 92, 93, 94].map((x): Point => [x, x, "", true]),
      ]),
    )
    expect(layout.dots).toHaveLength(1)
    expect(layout.outliers).toHaveLength(5)
    expect(layout.omitted).toBe(2)
  })

  it("外れ値が複数で名前が重なっていても、外れ値の数だけ描く", () => {
    const layout = scatterLayoutOf(
      spec([
        [1, 1, "同じ"],
        [80, 80, "同じ", true],
        [90, 90, "同じ", true],
      ]),
    )
    expect(layout.dots).toHaveLength(1)
    expect(layout.outliers).toHaveLength(2)
  })
})
