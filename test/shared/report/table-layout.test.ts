import { describe, expect, it } from "vitest"

import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import { matrixLegendStatuses, tableLayoutOf } from "../../../src/shared/report/table-layout.ts"

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
})
