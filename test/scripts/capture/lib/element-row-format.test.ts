import { describe, expect, test } from "vitest"

import {
  type ElementMeasure,
  formatElementLines,
} from "../../../../scripts/capture/lib/element-row-format.ts"

function rendered(top: number, height: number): ElementMeasure {
  return {
    kind: "rendered",
    top,
    bottom: top + height,
    left: 10.256,
    width: 300,
    height,
    scrollHeight: height + 5,
    clientHeight: height,
  }
}

describe("formatElementLines", () => {
  test("当たらなければ「無し」の1行", () => {
    expect(formatElementLines([])).toEqual(["無し"])
  })

  test("1件のときは位置と大きさの1行で、丸めて書く", () => {
    expect(formatElementLines([rendered(20, 100)])).toEqual([
      "top 20 / bottom 120 / left 10.26 / 幅 300 / 高さ 100 / scrollHeight 105 / clientHeight 100",
    ])
  })

  test("1件が描画されていなければその旨の1行", () => {
    expect(formatElementLines([{ kind: "hidden" }])).toEqual(["1件（描画されていない）"])
  })

  test("複数件は件数の行に続けて全件を順に1件1行で出す", () => {
    const lines = formatElementLines([rendered(0, 100), rendered(120, 250), rendered(400, 80)])
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe("3件")
    expect(lines[1]).toContain("1件目: top 0 / bottom 100")
    expect(lines[2]).toContain("2件目: top 120 / bottom 370")
    expect(lines[2]).toContain("高さ 250")
    expect(lines[3]).toContain("3件目: top 400 / bottom 480")
  })

  test("複数件のうち描画されていない要素はその行だけ旨を出す", () => {
    const lines = formatElementLines([rendered(0, 100), { kind: "hidden" }, rendered(400, 80)])
    expect(lines[2]).toBe("  2件目: 描画されていない")
    expect(lines[3]).toContain("3件目: top 400")
  })
})
