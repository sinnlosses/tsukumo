import { describe, expect, it } from "vitest"

import { colorsForDataset } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/chart-palette.ts"

const PALETTE = { series: ["#aa0001", "#aa0002"], other: "#000000" }

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
