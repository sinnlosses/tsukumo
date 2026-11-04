import { describe, expect, it } from "vitest"

import {
  reportRejectionText,
  reportViolations,
} from "../../../../../src/server/report/core/rules/index.ts"
import type { ReportBlock } from "../../../../../src/shared/report/report-block.ts"
import { code, draft, kinds } from "../../../../fixture/report-draft-block.ts"

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

    it("強調の行 { cells, emphasis } でもセルの数がずれれば違反で、揃っていれば違反でない", () => {
      const tableOf = (second: Extract<ReportBlock, { readonly kind: "table" }>["rows"][number]) =>
        ({
          kind: "table",
          title: "架空の表",
          columns: ["列", "値"],
          rows: [["a", { tag: "x" }], second],
          rest: "",
          fold: "",
          aside: "",
        }) satisfies ReportBlock
      expect(reportViolations(draft([tableOf({ cells: ["b"], emphasis: true })]))).toEqual([
        { kind: "ragged-table", count: 1 },
      ])
      expect(reportViolations(draft([tableOf({ cells: ["b", "2"], emphasis: true })]))).toEqual([])
    })

    it("detail だけの行は強調に数えない", () => {
      const table: ReportBlock = {
        kind: "table",
        title: "架空の表",
        columns: ["列", "値"],
        rows: Array.from({ length: 5 }, () => ({ cells: ["a", "1"], detail: "架空の中身" })),
        rest: "",
        fold: "",
        aside: "",
      }
      expect(reportViolations(draft([table]))).toEqual([])
    })

    it("強調の行は3行までで、4行以上は many-emphasis-rows の差し戻しになり文面に上限を載せる", () => {
      const tableOf = (emphasized: number): ReportBlock => ({
        kind: "table",
        title: "架空の表",
        columns: ["列", "値"],
        rows: Array.from({ length: 5 }, (_, index) =>
          index < emphasized ? { cells: ["a", "1"], emphasis: true as const } : ["b", "2"],
        ),
        rest: "",
        fold: "",
        aside: "",
      })
      expect(reportViolations(draft([tableOf(3)]))).toEqual([])
      const violations = reportViolations(draft([tableOf(4)]))
      expect(violations).toEqual([{ kind: "many-emphasis-rows", count: 1 }])
      expect(reportRejectionText(violations)).toContain("強調は3行までに絞る")
    })

    it.each([
      ["数の範囲に濃淡と合計", { from: 1, to: 2 }, true, [["a", "1", "2,000"]], true],
      ["合計なしで % の範囲", { from: 1, to: 2 }, undefined, [["a", "1%", "2%"]], true],
      ["範囲に字の列", { from: 0, to: 2 }, undefined, [["a", "1", "2"]], false],
      ["範囲に負の数", { from: 1, to: 2 }, undefined, [["a", "-1", "2"]], false],
      [
        "範囲に変化のセル",
        { from: 1, to: 2 },
        undefined,
        [["a", { from: "1", to: "2" }, "2"]],
        false,
      ],
      ["範囲が列の外", { from: 1, to: 3 }, undefined, [["a", "1", "2"]], false],
      ["範囲が逆順", { from: 2, to: 1 }, undefined, [["a", "1", "2"]], false],
      ["濃淡なしの合計", undefined, true, [["a", "1", "2"]], false],
      ["合計の範囲に %", { from: 1, to: 2 }, true, [["a", "1%", "2%"]], false],
    ] as const)("濃淡と合計: %s", (_, heat, totals, rows, accepted) => {
      const table: ReportBlock = {
        kind: "table",
        title: "架空の表",
        columns: ["列", "甲", "乙"],
        rows,
        rest: "",
        fold: "",
        aside: "",
        heat,
        totals,
      }
      const violations = reportViolations(draft([table]))
      expect(violations).toEqual(accepted ? [] : [{ kind: "heat-range", count: 1 }])
      if (!accepted) {
        expect(reportRejectionText(violations)).toContain("`heat`")
      }
    })

    it.each([
      ["0→1→2→1→0 の段", [0, 1, 2, 1, 0], undefined, true],
      ["0→3 の段の飛び", [0, 3, 0, 0, 0], undefined, false],
      ["最初の行が段 1", [1, 1, 0, 0, 0], undefined, false],
      ["段のある表に合計", [0, 1, 0, 0, 0], true, false],
    ] as const)("字下げの段: %s", (_, depths, totals, accepted) => {
      const table: ReportBlock = {
        kind: "table",
        title: "架空の表",
        columns: ["列", "値"],
        rows: depths.map((depth) => (depth === 0 ? ["a", "1"] : { cells: ["a", "1"], depth })),
        rest: "",
        fold: "",
        aside: "",
        heat: { from: 1, to: 1 },
        totals,
      }
      const violations = reportViolations(draft([table]))
      expect(violations).toEqual(accepted ? [] : [{ kind: "row-depth", count: 1 }])
      if (!accepted) {
        expect(reportRejectionText(violations)).toContain("`depth`")
      }
    })

    it.each([
      ["列の数と同じ位置", 2, [{ kind: "emphasis-column-range", count: 1 }]],
      ["列の数を超える位置", 5, [{ kind: "emphasis-column-range", count: 1 }]],
      ["最後の列", 1, []],
      ["先頭の列", 0, []],
      ["欄なし", undefined, []],
    ])("強調する列が %s のとき", (_, emphasisColumn, expected) => {
      const table: ReportBlock = {
        kind: "table",
        title: "架空の表",
        columns: ["列", "値"],
        rows: [["a", "1"]],
        rest: "",
        fold: "",
        aside: "",
        emphasisColumn,
      }
      const violations = reportViolations(draft([table]))
      expect(violations).toEqual(expected)
      if (expected.length > 0) {
        expect(reportRejectionText(violations)).toContain("列の数")
      }
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
        "インラインコードのパスの列は数えない",
        tableWith(
          ["ファイル", "変更"],
          [
            ["`src/server/report/core/rules/index.ts`", "架空"],
            ["`src/server/report/core/report-markdown-notation.ts`", "架空"],
          ],
        ),
        [],
      ],
      [
        "リンクの URL は数えない",
        twoColumns([
          ["a", `[架空](https://example.invalid/${"a".repeat(40)})`],
          ["b", `[架空](https://example.invalid/${"b".repeat(40)})`],
        ]),
        [],
      ],
      [
        "リンクの文字は数える",
        twoColumns([
          ["a", `[${cells(35)}](https://example.invalid/a)`],
          ["b", `[${cells(35)}](https://example.invalid/b)`],
        ]),
        ["sentence-table"],
      ],
      [
        "インラインコードの外の文字が35字以上なら違反",
        twoColumns([
          ["a", `${cells(35)} \`src/a.ts\``],
          ["b", `${cells(35)} \`src/b.ts\``],
        ]),
        ["sentence-table"],
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
      items: Array.from({ length: itemCount }, () => ({
        label: "",
        text: "架空",
        done: false,
        source: "",
        branch: "",
        branchTone: "warn",
      })),
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
        emphasis: [],
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
        emphasis: [],
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
        emphasis: [],
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
          emphasis: [],
          fold: "",
          aside: "",
        })
        expect(kinds(draft([chartOf(1)]))).toEqual(["ragged-chart"])
        expect(kinds(draft([chartOf(3)]))).toEqual(["ragged-chart"])
        expect(kinds(draft([chartOf(2)]))).toEqual([])
      },
    )
  })

  describe("chart の emphasis は labels の部分集合", () => {
    const chartOf = (emphasis: readonly string[]): ReportBlock => ({
      kind: "chart",
      title: "",
      chartKind: "bar",
      labels: ["架空A", "架空B"],
      series: [{ name: "架空系列", values: [1, 2] }],
      horizontal: false,
      emphasis,
      fold: "",
      aside: "",
    })

    it("labels に無い名前があれば違反", () => {
      expect(reportViolations(draft([chartOf(["架空C"])]))).toEqual([
        { kind: "unknown-emphasis", count: 1 },
      ])
      expect(kinds(draft([chartOf(["架空A", "架空C"])]))).toEqual(["unknown-emphasis"])
    })

    it("部分集合・省略なら違反にしない", () => {
      expect(kinds(draft([chartOf(["架空B"])]))).toEqual([])
      expect(kinds(draft([chartOf([])]))).toEqual([])
    })
  })

  describe("chart の基準線と注記は line に付け、名指しは series と labels の中", () => {
    const chartOf = (
      chartKind: "line" | "bar",
      references: readonly { readonly value: number; readonly label: string }[],
      annotations: readonly {
        readonly label: string
        readonly index: number
        readonly text: string
      }[],
    ): ReportBlock => ({
      kind: "chart",
      title: "",
      chartKind,
      labels: ["架空A", "架空B"],
      series: [{ name: "架空系列", values: [1, 2] }],
      horizontal: false,
      emphasis: [],
      references,
      annotations,
      fold: "",
      aside: "",
    })
    const reference = { value: 1.5, label: "架空の目標" }

    it.each([
      ["series に無い系列名", chartOf("line", [], [{ label: "架空C", index: 0, text: "x" }])],
      ["labels の数と同じ位置", chartOf("line", [], [{ label: "架空系列", index: 2, text: "x" }])],
      ["bar の基準線", chartOf("bar", [reference], [])],
      ["bar の注記", chartOf("bar", [], [{ label: "架空系列", index: 0, text: "x" }])],
    ])("%s は違反", (_, chart) => {
      const violations = reportViolations(draft([chart]))
      expect(violations).toEqual([{ kind: "chart-annotation-range", count: 1 }])
      expect(reportRejectionText(violations)).toContain("`line` に付け")
    })

    it("line で系列名と位置が範囲の中なら違反にしない", () => {
      const chart = chartOf("line", [reference], [{ label: "架空系列", index: 1, text: "x" }])
      expect(kinds(draft([chart]))).toEqual([])
    })
  })

  describe("chart の tones は share だけに labels と同じ数で、emphasis と併せない", () => {
    type Tone = "ok" | "warn" | "ng" | "info" | "none"
    const chartOf = (
      chartKind: "share" | "bar",
      tones: readonly Tone[],
      emphasis: readonly string[] = [],
    ): ReportBlock => ({
      kind: "chart",
      title: "",
      chartKind,
      labels: ["架空A", "架空B"],
      series: [{ name: "架空系列", values: [1, 2] }],
      horizontal: false,
      emphasis,
      tones,
      fold: "",
      aside: "",
    })

    it.each([
      ["bar の tones", chartOf("bar", ["ok", "none"])],
      ["labels より短い tones", chartOf("share", ["ok"])],
      ["labels より長い tones", chartOf("share", ["ok", "warn", "info"])],
      ["emphasis と併せた tones", chartOf("share", ["ok", "none"], ["架空A"])],
    ])("%s は違反", (_, chart) => {
      const violations = reportViolations(draft([chart]))
      expect(violations).toEqual([{ kind: "chart-tone-range", count: 1 }])
      expect(reportRejectionText(violations)).toContain("`share` だけに")
    })

    it("share で labels と同じ数なら違反にしない", () => {
      expect(kinds(draft([chartOf("share", ["info", "ok"])]))).toEqual([])
    })
  })

  describe("stats の series は3つ以上", () => {
    const EMPTY = { before: "", total: "", better: "", target: "", targetGap: "" } as const
    const statsOf = (series: readonly number[]): ReportBlock => ({
      kind: "stats",
      items: [
        { ...EMPTY, value: "1", label: "架空A", series },
        { ...EMPTY, value: "2", label: "架空B", series: [] },
        { ...EMPTY, value: "3", label: "架空C", series: [] },
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
