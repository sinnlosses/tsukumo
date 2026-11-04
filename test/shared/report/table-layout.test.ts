import { describe, expect, it } from "vitest"

import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import {
  heatLevelOf,
  isHeatPeak,
  matrixCellOf,
  matrixLegendStatuses,
  tableHeatOf,
  tableLayoutOf,
  tableTotalsOf,
} from "../../../src/shared/report/table-layout.ts"

type TableBlock = Extract<ReportBlock, { readonly kind: "table" }>
type MatrixBlock = Extract<ReportBlock, { readonly kind: "matrix" }>

function table(columns: readonly string[], rows: TableBlock["rows"]): TableBlock {
  return { kind: "table", title: "", columns, rows, rest: "", fold: "", aside: "" }
}

describe("tableLayoutOf", () => {
  it("列の数だけ揃え・棒・状態の列を返す", () => {
    const layout = tableLayoutOf(
      table(
        ["名前", "件数", "状態"],
        [
          ["架空のA", "10", { status: "ok", text: "良好" }],
          ["架空のB", "5", { status: "ng", text: "不良" }],
        ],
      ),
    )

    expect(layout.aligns).toEqual(["left", "right", "left"])
    expect(layout.bars).toEqual([{ kind: "none" }, { kind: "bar", max: 10 }, { kind: "none" }])
    expect(layout.statusColumns).toEqual([false, false, true])
  })

  it.each([
    ["行が 1 つ", [["架空", "10"]]],
    [
      "負の数がある",
      [
        ["架空のA", "-1"],
        ["架空のB", "5"],
      ],
    ],
    [
      "最大値が 0",
      [
        ["架空のA", "0"],
        ["架空のB", "0"],
      ],
    ],
    [
      "数でない字が混じる",
      [
        ["架空のA", "10"],
        ["架空のB", "約5"],
      ],
    ],
    [
      "変わったセルが混じる",
      [
        ["架空のA", "10"],
        ["架空のB", { from: "3", to: "5" }],
      ],
    ],
  ] as const)("棒を出さない: %s", (_, rows) => {
    const layout = tableLayoutOf(table(["名前", "件数"], rows))

    expect(layout.bars[1]).toEqual({ kind: "none" })
  })

  it("前と後がどちらも数の変化セルだけの列は右に揃え、棒は出さない", () => {
    const layout = tableLayoutOf(
      table(
        ["名前", "件数"],
        [
          ["架空のA", { from: "3", to: "5" }],
          ["架空のB", { from: "1", to: "2" }],
        ],
      ),
    )

    expect(layout.aligns[1]).toBe("right")
    expect(layout.bars[1]).toEqual({ kind: "none" })
  })

  it("凡例は表に出た状態だけを ok・warn・ng の順で返す", () => {
    const layout = tableLayoutOf(
      table(
        ["名前", "状態"],
        [
          ["架空のA", { status: "ng", text: "不良" }],
          { cells: ["架空のB", { status: "ok", text: "良好" }], emphasis: true },
        ],
      ),
    )

    expect(layout.legendStatuses).toEqual(["ok", "ng"])
  })

  it("行のどのセルの状態も凡例に残る（1 つでも欠けたら落ちる）", () => {
    const statuses = ["ok", "warn", "ng"] as const
    const layout = tableLayoutOf(
      table(
        ["名前", "状態"],
        statuses.map((status) => ["架空", { status, text: status }]),
      ),
    )

    expect(layout.legendStatuses).toEqual(statuses)
  })
})

describe("濃淡と合計", () => {
  const WEEK: TableBlock = {
    ...table(
      ["曜日", "0-6", "6-12", "12-18"],
      [
        ["月", "2", "9", "6"],
        ["火", "1", "12", "8"],
        ["水", "3", "41", "22"],
      ],
    ),
    heat: { from: 1, to: 3 },
    totals: true,
  }

  it("範囲の最大値を6等分した帯で段を決め、最大のセルだけが山になる", () => {
    const heat = tableHeatOf(WEEK)
    if (heat.kind !== "heat") throw new Error("濃淡が無い")

    expect(heat.max).toBe(41)
    expect(["2", "6", "8", "22", "41"].map((cell) => heatLevelOf(heat, cell))).toEqual([
      0, 0, 1, 3, 5,
    ])
    expect(["41", "22"].map((cell) => isHeatPeak(heat, cell))).toEqual([true, false])
  })

  it("最大値が 0 なら段はどれも 0 で山は無い", () => {
    const heat = tableHeatOf({ ...WEEK, rows: [["月", "0", "0", "0"]] })
    if (heat.kind !== "heat") throw new Error("濃淡が無い")

    expect(heatLevelOf(heat, "0")).toBe(0)
    expect(isHeatPeak(heat, "0")).toBe(false)
  })

  it("濃淡の範囲の列には棒を出さず、範囲の外の数の列には出す", () => {
    const layout = tableLayoutOf({
      ...table(
        ["名前", "甲", "乙"],
        [
          ["架空のA", "1", "3"],
          ["架空のB", "2", "4"],
        ],
      ),
      heat: { from: 1, to: 1 },
    })

    expect(layout.bars).toEqual([{ kind: "none" }, { kind: "none" }, { kind: "bar", max: 4 }])
  })

  it("行の合計・列の合計・総計を範囲のセルから足す", () => {
    expect(tableTotalsOf(WEEK)).toEqual({
      kind: "totals",
      rows: ["17", "21", "66"],
      columns: ["6", "62", "36"],
      grand: "104",
    })
  })

  it("合計は渡した行だけを足す", () => {
    const totals = tableTotalsOf({ ...WEEK, rows: WEEK.rows.slice(0, 1) })

    expect(totals).toEqual({ kind: "totals", rows: ["17"], columns: ["2", "9", "6"], grand: "17" })
  })

  it("小数の桁はセルのいちばん長い桁に、桁区切りはセルにあれば付ける", () => {
    const totals = tableTotalsOf({
      ...table(
        ["名前", "甲", "乙"],
        [
          ["架空のA", "1,200.5", "0.25"],
          ["架空のB", "800", "1"],
        ],
      ),
      heat: { from: 1, to: 2 },
      totals: true,
    })

    expect(totals).toEqual({
      kind: "totals",
      rows: ["1,200.75", "801.00"],
      columns: ["2,000.50", "1.25"],
      grand: "2,001.75",
    })
  })

  it.each([
    ["濃淡が無い", { ...WEEK, heat: undefined }],
    ["合計の欄が無い", { ...WEEK, totals: undefined }],
  ])("合計を出さない: %s", (_, block) => {
    expect(tableTotalsOf(block)).toEqual({ kind: "none" })
  })
})

describe("matrixLegendStatuses", () => {
  it("格子に出た状態だけを ok・warn・ng・na の順で返す", () => {
    const block: MatrixBlock = {
      kind: "matrix",
      title: "",
      columns: ["甲", "乙"],
      rows: [
        { name: "架空のA", cells: ["na", "ok"] },
        { name: "架空のB", cells: ["ng", "ok"] },
      ],
      fold: "",
      aside: "",
    }

    expect(matrixLegendStatuses(block)).toEqual(["ok", "ng", "na"])
  })

  it("補足付きのセルの状態も凡例に出す", () => {
    const block: MatrixBlock = {
      kind: "matrix",
      title: "",
      columns: ["甲"],
      rows: [{ name: "架空のA", cells: [{ status: "warn", note: "7日まで" }] }],
      fold: "",
      aside: "",
    }

    expect(matrixLegendStatuses(block)).toEqual(["warn"])
  })
})

describe("matrixCellOf", () => {
  it.each([
    ["状態だけのセル", "ok", { status: "ok", note: "" }],
    ["補足付きのセル", { status: "warn", note: "7日まで" }, { status: "warn", note: "7日まで" }],
  ] as const)("%s から状態と補足を取り出す", (_, cell, expected) => {
    expect(matrixCellOf(cell)).toEqual(expected)
  })
})
