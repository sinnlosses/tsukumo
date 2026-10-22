import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { code, draft, kinds } from "../../../fixture/report-draft-block.ts"

describe("reportViolations", () => {
  describe("表の行の長さは columns と揃える", () => {
    it("セルの数が揃わない行のある表は違反", () => {
      const table: ReportBlock = {
        kind: "table",
        title: "架空の表",
        columns: ["列", "値"],
        rows: [["a", "1"], ["b"]],
        rest: "",
        fold: "",
        aside: "",
      }
      expect(reportViolations(draft([table]))).toEqual([{ kind: "ragged-table", count: 1 }])
    })

    it("セルの数が揃わない行のある matrix も違反", () => {
      const matrix: ReportBlock = {
        kind: "matrix",
        title: "架空の対応",
        columns: ["列A", "列B"],
        rows: [{ name: "行1", cells: ["ok"] }],
        fold: "",
        aside: "",
      }
      expect(reportViolations(draft([matrix]))).toEqual([{ kind: "ragged-table", count: 1 }])
    })
  })

  describe("セルが文の列になっている表", () => {
    const cells = (length: number) => "あ".repeat(length)
    const tableWith = (
      columns: readonly string[],
      rows: Extract<ReportBlock, { readonly kind: "table" }>["rows"],
    ): ReportBlock => ({
      kind: "table",
      title: "架空の表",
      columns,
      rows,
      rest: "",
      fold: "",
      aside: "",
    })
    const twoColumns = (rows: Extract<ReportBlock, { readonly kind: "table" }>["rows"]) =>
      tableWith(["名前", "説明"], rows)

    it.each([
      [
        "35字ちょうどの平均",
        twoColumns([
          ["a", cells(35)],
          ["b", cells(35)],
        ]),
        ["sentence-table"],
      ],
      [
        "34字の平均",
        twoColumns([
          ["a", cells(34)],
          ["b", cells(34)],
        ]),
        [],
      ],
      [
        "平均が35字になる長短の行",
        twoColumns([
          ["a", cells(30)],
          ["b", cells(40)],
        ]),
        ["sentence-table"],
      ],
      ["長いセルがあっても1行の表", twoColumns([["a", cells(80)]]), []],
      [
        "状態のセルは text を数える",
        twoColumns([
          ["a", { status: "ok", text: cells(35) }],
          ["b", { status: "ng", text: cells(35) }],
        ]),
        ["sentence-table"],
      ],
      [
        "変わったセルは from と to を足して数える",
        twoColumns([
          ["a", { from: cells(20), to: cells(15) }],
          ["b", { from: cells(20), to: cells(15) }],
        ]),
        ["sentence-table"],
      ],
      [
        "変わったセルの from と to の足し合わせが34字",
        twoColumns([
          ["a", { from: cells(20), to: cells(14) }],
          ["b", { from: cells(20), to: cells(14) }],
        ]),
        [],
      ],
      [
        "1列だけ長ければ、ほかの列が短くても違反",
        tableWith(
          ["A", "B", "C"],
          [
            ["a", "b", cells(36)],
            ["c", "d", cells(36)],
          ],
        ),
        ["sentence-table"],
      ],
      [
        "全部の列の合計が長くても、列ごとの平均が35字未満なら通る",
        tableWith(
          ["A", "B", "C"],
          [
            [cells(20), cells(20), cells(20)],
            [cells(20), cells(20), cells(20)],
          ],
        ),
        [],
      ],
      [
        "行が columns より短い表は、足りないセルを0字として行数で割る",
        twoColumns([["a", cells(40)], ["b"]]),
        ["ragged-table"],
      ],
    ] as const)("%s", (_name, table, expected) => {
      expect(kinds(draft([table]))).toEqual(expected)
    })

    it("入力の字数は数えた値と合っている", () => {
      expect([...cells(35)].length).toBe(35)
      expect([...cells(34)].length).toBe(34)
    })

    it("差し戻しは表の数と字数の基準を文面に持つ", () => {
      const violations = reportViolations(
        draft([
          twoColumns([
            ["a", cells(36)],
            ["b", cells(36)],
          ]),
          twoColumns([
            ["a", cells(50)],
            ["b", cells(50)],
          ]),
        ]),
      )
      expect(violations).toEqual([{ kind: "sentence-table", count: 2 }])
      expect(reportRejectionText(violations)).toContain("セルの平均が35字以上の列がある表が2個")
    })

    it("long-table の次に並ぶ", () => {
      const long = tableWith(
        ["A", "B"],
        Array.from({ length: 11 }, () => ["a", cells(40)]),
      )
      expect(kinds(draft([long]))).toEqual(["long-table", "sentence-table"])
    })
  })

  describe("件数の上限", () => {
    const tableOf = (rowCount: number, rest = ""): ReportBlock => ({
      kind: "table",
      title: "架空の表",
      columns: ["列A", "列B"],
      rows: Array.from({ length: rowCount }, () => ["a", "1"]),
      rest,
      fold: "",
      aside: "",
    })
    const listOf = (itemCount: number): ReportBlock => ({
      kind: "list",
      style: "bullet",
      items: Array.from({ length: itemCount }, () => ({ label: "", text: "架空", done: false })),
      fold: "",
      aside: "",
    })
    const lines = (count: number) => Array.from({ length: count }, () => "x").join("\n")

    it.each([
      [10, "", []],
      [11, "", ["long-table"]],
      [11, "ほか 3 件", []],
    ] as const)("表が%i行で rest が「%s」なら %j", (rowCount, rest, expected) => {
      expect(kinds(draft([tableOf(rowCount, rest)]))).toEqual(expected)
    })

    it.each([
      [10, []],
      [11, ["long-list"]],
    ] as const)("list が%i件なら %j", (itemCount, expected) => {
      expect(kinds(draft([listOf(itemCount)]))).toEqual(expected)
    })

    it.each([
      [45, []],
      [46, ["long-code"]],
    ] as const)("marks の無い code が%i行なら %j", (lineCount, expected) => {
      expect(kinds(draft([code("", lines(lineCount))]))).toEqual(expected)
    })

    it("marks があれば code が長くても違反にしない", () => {
      const marked: ReportBlock = {
        kind: "code",
        language: "text",
        path: "",
        source: lines(46),
        marks: [{ lines: "1", label: "架空" }],
        fold: "",
        aside: "",
      }
      expect(kinds(draft([marked]))).toEqual([])
    })
  })

  describe("chart の series の値の数は labels と揃える", () => {
    it("values の数が labels と揃わない系列があれば違反", () => {
      const chart: ReportBlock = {
        kind: "chart",
        title: "",
        chartKind: "bar",
        labels: ["架空A", "架空B"],
        series: [{ name: "架空系列", values: [1] }],
        horizontal: false,
        fold: "",
        aside: "",
      }
      expect(reportViolations(draft([chart]))).toEqual([{ kind: "ragged-chart", count: 1 }])
    })

    it("揃っていれば違反にしない", () => {
      const chart: ReportBlock = {
        kind: "chart",
        title: "",
        chartKind: "bar",
        labels: ["架空A", "架空B"],
        series: [{ name: "架空系列", values: [1, 2] }],
        horizontal: false,
        fold: "",
        aside: "",
      }
      expect(kinds(draft([chart]))).toEqual([])
    })

    it("share は series の数を問わない（値の数が labels と揃えばよい）", () => {
      const chartOf = (seriesCount: number): ReportBlock => ({
        kind: "chart",
        title: "",
        chartKind: "share",
        labels: ["架空A", "架空B"],
        series: Array.from({ length: seriesCount }, (_, index) => ({
          name: `架空系列${String(index)}`,
          values: [1, 2],
        })),
        horizontal: false,
        fold: "",
        aside: "",
      })
      expect(kinds(draft([chartOf(1)]))).toEqual([])
      expect(kinds(draft([chartOf(3)]))).toEqual([])
    })

    it.each(["arrow", "slope", "span"] as const)(
      "%s は series が2つでなければ違反",
      (chartKind) => {
        const chartOf = (seriesCount: number): ReportBlock => ({
          kind: "chart",
          title: "",
          chartKind,
          labels: ["架空A", "架空B"],
          series: Array.from({ length: seriesCount }, (_, index) => ({
            name: `架空系列${String(index)}`,
            values: [1, 2],
          })),
          horizontal: false,
          fold: "",
          aside: "",
        })
        expect(kinds(draft([chartOf(1)]))).toEqual(["ragged-chart"])
        expect(kinds(draft([chartOf(3)]))).toEqual(["ragged-chart"])
        expect(kinds(draft([chartOf(2)]))).toEqual([])
      },
    )
  })

  describe("stats の series は3つ以上", () => {
    const statsOf = (series: readonly number[]): ReportBlock => ({
      kind: "stats",
      items: [
        { before: "", value: "1", total: "", label: "架空A", series, better: "" },
        { before: "", value: "2", total: "", label: "架空B", series: [], better: "" },
        { before: "", value: "3", total: "", label: "架空C", series: [], better: "" },
      ],
      fold: "",
      aside: "",
    })

    it.each([
      [0, []],
      [1, ["short-series"]],
      [2, ["short-series"]],
      [3, []],
    ] as const)("series が%i個なら %j", (count, expected) => {
      const series = Array.from({ length: count }, (_, index) => index)
      expect(kinds(draft([statsOf(series)]))).toEqual(expected)
    })
  })
})
