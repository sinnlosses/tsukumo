import { describe, expect, it } from "vitest"

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
})
