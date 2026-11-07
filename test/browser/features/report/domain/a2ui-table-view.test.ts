import { describe, expect, it } from "vitest"

import {
  filteredRowOrder,
  filterBadges,
  hasBoundChoicePicker,
  visibleRowOrder,
  visibleTableTotals,
} from "../../../../../src/browser/features/report/domain/a2ui-table-view.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { A2uiReportPart } from "../../../../../src/shared/report/a2ui-report-outline.ts"
import type { TableCell } from "../../../../../src/shared/report/report-block-comparison.ts"

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

describe("visibleRowOrder の絞り込み", () => {
  it("filterColumn の列だけを見て、選びが空なら全行を残す", () => {
    const part = { ...table(["甲", "乙", "甲"]), filterColumn: 0 }

    expect(filteredRowOrder(part, [])).toEqual([0, 1, 2])
    expect(filteredRowOrder(part, ["甲"])).toEqual([0, 2])
    expect(filteredRowOrder(part, ["x"])).toEqual([])
  })

  it("絞り込んだ行だけを並べ替える", () => {
    const part = table(["3", "1", "2"])

    expect(visibleRowOrder(part, { column: 0, direction: "asc" }, ["3", "2"])).toEqual([2, 0])
  })
})

describe("detail を持つ行", () => {
  it("絞り込みと並べ替えを通っても元の添字で並び、detail の字は絞り込みに使わない", () => {
    const part = {
      ...table([]),
      filterColumn: 0,
      rows: [{ cells: ["3", "x"], detail: "甲" }, ["1", "x"], { cells: ["2", "x"], detail: "乙" }],
    }

    expect(visibleRowOrder(part, { column: 0, direction: "asc" }, [])).toEqual([1, 2, 0])
    expect(filteredRowOrder(part, ["3"])).toEqual([0])
    expect(filteredRowOrder(part, ["甲"])).toEqual([])
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

describe("字下げのある表", () => {
  const treeTable = (): A2uiReportPart<"Table"> => ({
    ...table([]),
    columns: ["場所", "行数", "全体に占める割合"],
    filterColumn: 0,
    rows: [
      ["src/", "57,000", "72%"],
      { cells: ["ui/", "31,200", "39%"], depth: 1 },
      { cells: ["components/", "18,600", "24%"], depth: 2 },
      { cells: ["table.tsx", "2,900", "4%"], depth: 3 },
      { cells: ["server/", "19,400", "25%"], depth: 1 },
      { cells: ["shared/", "6,300", "8%"], depth: 1 },
      ["test/", "15,900", "20%"],
      { cells: ["unit/", "9,800", "12%"], depth: 1 },
      { cells: ["e2e/", "6,100", "8%"], depth: 1 },
    ],
  })

  it("同じ親の子どうしの中だけで並べ、子は部分木ごと親の直下に付く", () => {
    const part = treeTable()

    expect(visibleRowOrder(part, { column: 1, direction: "asc" }, [])).toEqual([
      6, 8, 7, 0, 5, 4, 1, 2, 3,
    ])
    expect(visibleRowOrder(part, { column: 1, direction: "desc" }, [])).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ])
  })

  it("絞り込みは合う行の祖先も残す", () => {
    const part = treeTable()

    expect(filteredRowOrder(part, ["table.tsx"])).toEqual([0, 1, 2, 3])
    expect(visibleRowOrder(part, { column: 1, direction: "asc" }, ["e2e/", "shared/"])).toEqual([
      6, 8, 0, 5,
    ])
  })
})

type TableRows = A2uiReportPart<"Table">["rows"]

function badgeTable(
  rows: TableRows,
  extra: Partial<A2uiReportPart<"Table">> = {},
): A2uiReportPart<"Table"> {
  return {
    ...table([]),
    rows,
    filterable: true,
    filterColumn: 0,
    ...extra,
  }
}

function repeated(count: number, cell: TableCell): TableRows {
  return Array.from({ length: count }, () => [cell, "x"])
}

describe("filterBadges", () => {
  it("状態のセルは text を値として、初めて現れた順に件数を数える", () => {
    const rows = [
      ...repeated(3, { status: "ng", text: "落ちた" }),
      ...repeated(12, { status: "ok", text: "通った" }),
    ]

    expect(filterBadges(badgeTable(rows))).toEqual([
      { value: "落ちた", count: 3 },
      { value: "通った", count: 12 },
    ])
  })

  it("重複した文字列は 1 つの値にまとめ、初出の順を保つ", () => {
    const rows = [
      ["甲", "x"],
      ["乙", "x"],
      ["甲", "x"],
    ]

    expect(filterBadges(badgeTable(rows))).toEqual([
      { value: "甲", count: 2 },
      { value: "乙", count: 1 },
    ])
  })

  it("値が 1 種類なら空", () => {
    expect(filterBadges(badgeTable(repeated(3, "甲")))).toEqual([])
  })

  it("値が 6 種類までは出し、7 種類は空", () => {
    const kinds = (count: number) => ["甲", "乙", "丙", "丁", "戊", "己", "庚"].slice(0, count)

    expect(filterBadges(badgeTable(kinds(6).map((cell) => [cell, "x"])))).toHaveLength(6)
    expect(filterBadges(badgeTable(kinds(7).map((cell) => [cell, "x"])))).toEqual([])
  })

  it("filterable が偽・filterColumn が無い・列が表の外なら空", () => {
    const rows = [
      ["甲", "x"],
      ["乙", "x"],
    ]

    expect(filterBadges(badgeTable(rows, { filterable: false }))).toEqual([])
    expect(filterBadges(badgeTable(rows, { filterColumn: undefined }))).toEqual([])
    expect(filterBadges(badgeTable(rows, { filterColumn: 5 }))).toEqual([])
  })

  it("変わったセルは from と to の両方の値として数える", () => {
    const rows = [
      [{ from: "甲", to: "乙" }, "x"],
      ["乙", "x"],
    ]

    expect(filterBadges(badgeTable(rows))).toEqual([
      { value: "甲", count: 1 },
      { value: "乙", count: 2 },
    ])
  })
})

describe("visibleTableTotals", () => {
  const part: A2uiReportPart<"Table"> = {
    ...table([]),
    columns: ["曜日", "前半", "後半"],
    rows: [
      ["月", "2", "9"],
      ["火", "1", "12"],
      ["水", "3", "41"],
    ],
    heat: { from: 1, to: 2 },
    totals: true,
    filterColumn: 0,
  }

  it("並べ替えた行の順に行の合計を並べ、列の合計は順に依らない", () => {
    const order = visibleRowOrder(part, { column: 2, direction: "desc" }, [])

    expect(order).toEqual([2, 1, 0])
    expect(visibleTableTotals(part, order)).toEqual({
      kind: "totals",
      rows: ["44", "13", "11"],
      columns: ["6", "62"],
      grand: "68",
    })
  })

  it("絞り込んだ行だけを足す", () => {
    expect(visibleTableTotals(part, filteredRowOrder(part, ["水"]))).toEqual({
      kind: "totals",
      rows: ["44"],
      columns: ["3", "41"],
      grand: "44",
    })
  })
})

describe("hasBoundChoicePicker", () => {
  const picker = (value: A2uiReportPart<"ChoicePicker">["value"]): A2uiReportComponent => ({
    id: "pick",
    component: "ChoicePicker",
    options: [],
    value,
  })

  it("同じ表の filter path に結んだ ChoicePicker だけを真とする", () => {
    expect(hasBoundChoicePicker([picker({ path: "/view/t/filter" })], "t")).toBe(true)
    expect(hasBoundChoicePicker([picker({ path: "/view/other/filter" })], "t")).toBe(false)
    expect(hasBoundChoicePicker([picker(["甲"])], "t")).toBe(false)
    expect(hasBoundChoicePicker([], "t")).toBe(false)
  })
})
