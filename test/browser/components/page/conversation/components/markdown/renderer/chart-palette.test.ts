import { describe, expect, it } from "vitest"

import {
  colorsForDataset,
  emphasisColorsForDataset,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/chart-palette.ts"

const PALETTE = { series: ["#aa0001", "#aa0002"], other: "#000000", muted: "#777777" }

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
