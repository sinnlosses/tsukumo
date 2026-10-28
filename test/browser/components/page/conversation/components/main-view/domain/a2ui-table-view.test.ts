import { describe, expect, it } from "vitest"

import {
  arrangedTableMarkdown,
  visibleRowOrder,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/a2ui-table-view.ts"
import type { A2uiReportPart } from "../../../../../../../../src/shared/report/a2ui-report-outline.ts"

function table(cells: readonly string[]): A2uiReportPart<"Table"> {
  return {
    id: "t",
    component: "Table",
    title: "架空の表",
    columns: ["架空の列", "架空の別の列"],
    rows: cells.map((cell) => [cell, "x"]),
    rest: "",
    fold: "",
    aside: "",
    sortable: true,
  }
}

const SPLIT = {
  before: "<div>\n\n| 名 | 数 |\n| --- | ---: |\n",
  rows: ["| a | 1 |", "| b | 2 |", "| c | 3 |"],
  after: "\n\n<div>rest</div>\n\n</div>",
}

describe("arrangedTableMarkdown", () => {
  it("全行を元の順に渡すと元の Markdown に戻る", () => {
    const original = `${SPLIT.before}${SPLIT.rows.join("\n")}${SPLIT.after}`

    expect(arrangedTableMarkdown(SPLIT, [0, 1, 2])).toBe(original)
  })

  it("選んだ行だけを渡した順に並べる", () => {
    expect(arrangedTableMarkdown(SPLIT, [2, 0])).toBe(
      `${SPLIT.before}| c | 3 |\n| a | 1 |${SPLIT.after}`,
    )
  })

  it("行が 0 件なら、見出しの行と区切りの行だけの表になる", () => {
    expect(arrangedTableMarkdown(SPLIT, [])).toBe(`${SPLIT.before}${SPLIT.after}`)
  })
})

describe("visibleRowOrder の絞り込み", () => {
  it("filterColumn の列だけを見て、選びが空なら全行を残す", () => {
    const part = { ...table(["甲", "乙", "甲"]), filterColumn: 0 }

    expect(visibleRowOrder(part, undefined, [])).toEqual([0, 1, 2])
    expect(visibleRowOrder(part, undefined, ["甲"])).toEqual([0, 2])
    expect(visibleRowOrder(part, undefined, ["x"])).toEqual([])
  })

  it("絞り込んだ行だけを並べ替える", () => {
    const part = table(["3", "1", "2"])

    expect(visibleRowOrder(part, { column: 0, direction: "asc" }, ["3", "2"])).toEqual([2, 0])
  })
})

describe("visibleRowOrder の並べ替え", () => {
  it("日付の字は時刻の順に並ぶ（日付だけは 0 時として扱う）", () => {
    const part = table(["2026-10-02", "2026-09-28 10:00", "2026-09-28"])

    expect(visibleRowOrder(part, { column: 0, direction: "asc" }, [])).toEqual([2, 1, 0])
  })

  it("存在しない日付は文字の順に並べる", () => {
    const part = table(["2026-13-45", "2026-01-01"])

    expect(visibleRowOrder(part, { column: 0, direction: "asc" }, [])).toEqual([1, 0])
  })

  it("数の字は大きさの順（桁区切りつき）、同じ値は元の順", () => {
    const part = table(["1,000", "9", "9", "100"])

    expect(visibleRowOrder(part, { column: 0, direction: "desc" }, [])).toEqual([0, 3, 1, 2])
  })
})
