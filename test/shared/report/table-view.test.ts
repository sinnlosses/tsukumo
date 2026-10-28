import { describe, expect, it } from "vitest"

import {
  tableCellTexts,
  tableIdOfFilterPath,
  tableRowFilterTexts,
  tableViewPath,
} from "../../../src/shared/report/table-view.ts"

describe("表の操作の状態の path", () => {
  it("組んだ filter の path から表の ID を読み戻せる", () => {
    expect(tableIdOfFilterPath(tableViewPath("t1", "filter"))).toBe("t1")
  })

  it.each(["/view/t1/sort", "/view/t1/filter/x", "/other/t1/filter", "/view//filter", 3])(
    "filter の形でない path %s は読まない",
    (path) => {
      expect(tableIdOfFilterPath(path)).toBeUndefined()
    },
  )
})

describe("セルの文字", () => {
  it.each([
    { name: "文字列", cell: "甲", texts: ["甲"] },
    { name: "状態", cell: { status: "ok", text: "完了" }, texts: ["完了"] },
    { name: "変わったセル", cell: { from: "甲", to: "乙" }, texts: ["甲", "乙"] },
    { name: "札", cell: { tag: "丙" }, texts: ["丙"] },
    { name: "数や null", cell: 3, texts: [] },
  ])("$name のセルの文字", ({ cell, texts }) => {
    expect(tableCellTexts(cell)).toEqual(texts)
  })

  it("行の絞り込みの文字は、列を指せばその列だけ、指さなければ全列で、強調の行も同じ", () => {
    const cells = ["甲", { tag: "乙" }, "丙"]

    expect(tableRowFilterTexts(cells, undefined)).toEqual(["甲", "乙", "丙"])
    expect(tableRowFilterTexts(cells, 1)).toEqual(["乙"])
    expect(tableRowFilterTexts({ cells, emphasis: true }, 2)).toEqual(["丙"])
    expect(tableRowFilterTexts("壊れた行", undefined)).toEqual([])
  })
})
