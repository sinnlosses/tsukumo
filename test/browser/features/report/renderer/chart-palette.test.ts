import { describe, expect, it } from "vitest"

import {
  colorsForDataset,
  emphasisColorsForDataset,
  tonedColorsForDataset,
} from "../../../../../src/browser/features/report/renderer/chart-palette.ts"

const PALETTE = {
  series: ["#aa0001", "#aa0002"],
  other: "#000000",
  muted: "#777777",
  states: { ok: "#00aa01", warn: "#00aa02", ng: "#00aa03", info: "#00aa04" },
}

describe("colorsForDataset", () => {
  it("系列ごとにパレットの順で配り、使い切ったら other にする", () => {
    const colorOf = (index: number): unknown =>
      colorsForDataset({}, "bar", index, PALETTE)?.backgroundColor

    expect([colorOf(0), colorOf(1), colorOf(2)]).toEqual(["#aa0001", "#aa0002", "#000000"])
  })

  it("円はデータ点ごとに配る", () => {
    expect(colorsForDataset({ data: [1, 2, 3] }, "pie", 0, PALETTE)).toEqual({
      backgroundColor: ["#aa0001", "#aa0002", "#000000"],
      borderColor: ["#aa0001", "#aa0002", "#000000"],
    })
  })

  it("書き手が色を指定した系列は上書きしない", () => {
    expect(colorsForDataset({ backgroundColor: "red" }, "bar", 0, PALETTE)).toBeUndefined()
  })
})

describe("tonedColorsForDataset", () => {
  const tones = ["ok", "warn", "ng", "info", "none"] as const
  const colorOf = (index: number): unknown =>
    tonedColorsForDataset({ data: [20] }, index, PALETTE, tones)?.backgroundColor

  it("系列（部分）ごとに同じ位置の語の状態の色にし、none は muted", () => {
    expect([0, 1, 2, 3, 4].map(colorOf)).toEqual([
      "#00aa01",
      "#00aa02",
      "#00aa03",
      "#00aa04",
      "#777777",
    ])
  })

  it("語の無い位置は muted", () => {
    expect(colorOf(5)).toBe("#777777")
  })

  it("書き手が色を指定した系列は上書きしない", () => {
    expect(tonedColorsForDataset({ borderColor: "red" }, 0, PALETTE, tones)).toBeUndefined()
  })
})

describe("emphasisColorsForDataset", () => {
  it("bar・pie は強調するデータ点だけ先頭の系列色で、ほかは muted", () => {
    expect(
      emphasisColorsForDataset({ data: [1, 2, 3] }, 0, PALETTE, { positions: [1], axis: "point" }),
    ).toEqual({
      backgroundColor: ["#777777", "#aa0001", "#777777"],
      borderColor: ["#777777", "#aa0001", "#777777"],
    })
  })

  it("share は強調する系列だけ先頭の系列色で、ほかの系列は muted", () => {
    const colorOf = (index: number): unknown =>
      emphasisColorsForDataset({ data: [50] }, index, PALETTE, {
        positions: [1],
        axis: "series",
      })?.backgroundColor

    expect([colorOf(0), colorOf(1)]).toEqual(["#777777", "#aa0001"])
  })

  it("書き手が色を指定した系列は上書きしない", () => {
    expect(
      emphasisColorsForDataset({ backgroundColor: "red" }, 0, PALETTE, {
        positions: [0],
        axis: "series",
      }),
    ).toBeUndefined()
  })
})
