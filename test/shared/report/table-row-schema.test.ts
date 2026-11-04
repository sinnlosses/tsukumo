import { describe, expect, it } from "vitest"

import {
  isEmphasisRow,
  tableRowCells,
  tableRowDepth,
  tableRowDetail,
} from "../../../src/shared/report/report-block-comparison.ts"
import { namedWriterBlockSchema } from "../../../src/shared/report/report-block.ts"

describe("table の行の形", () => {
  const tableWith = (row: unknown): boolean =>
    namedWriterBlockSchema.safeParse({ kind: "table", title: "", columns: ["a", "b"], rows: [row] })
      .success

  it("{ tag } のセルと { cells, emphasis: true } の行を受ける", () => {
    expect(tableWith(["1", { tag: "sonnet" }])).toBe(true)
    expect(tableWith({ cells: ["1", { tag: "sonnet" }], emphasis: true })).toBe(true)
  })

  it("emphasis: false と cells の無い object は受けない", () => {
    expect(tableWith({ cells: ["1", "2"], emphasis: false })).toBe(false)
    expect(tableWith({ emphasis: true })).toBe(false)
  })

  it("detail を持つ行を受け、文字でない detail は受けない", () => {
    expect(tableWith({ cells: ["1", "2"], detail: "詳しい中身" })).toBe(true)
    expect(tableWith({ cells: ["1", "2"], emphasis: true, detail: "詳しい中身" })).toBe(true)
    expect(tableWith({ cells: ["1", "2"], detail: 1 })).toBe(false)
  })

  it("depth は 1〜3 の整数だけ受け、0・4・小数は受けない", () => {
    expect([1, 2, 3].map((depth) => tableWith({ cells: ["1", "2"], depth }))).toEqual([
      true,
      true,
      true,
    ])
    expect([0, 4, 1.5].map((depth) => tableWith({ cells: ["1", "2"], depth }))).toEqual([
      false,
      false,
      false,
    ])
  })
})

describe("行の読み出し", () => {
  const rows = [
    ["1", "2"],
    { cells: ["1", "2"], emphasis: true },
    { cells: ["1", "2"], detail: "中身" },
    { cells: ["1", "2"], emphasis: true, detail: "中身" },
  ] as const

  it("isEmphasisRow は emphasis が true の行だけ真", () => {
    expect(rows.map(isEmphasisRow)).toEqual([false, true, false, true])
  })

  it("tableRowCells は 4 つの形のどれからもセルを返す", () => {
    expect(rows.map(tableRowCells)).toEqual(rows.map(() => ["1", "2"]))
  })

  it("tableRowDetail は detail のある行だけ中身を返す", () => {
    expect(rows.map(tableRowDetail)).toEqual([undefined, undefined, "中身", "中身"])
  })

  it("tableRowDepth は depth のある行だけその段を返し、ほかは 0", () => {
    expect([...rows, { cells: ["1", "2"], depth: 2 }].map(tableRowDepth)).toEqual([0, 0, 0, 0, 2])
  })
})
