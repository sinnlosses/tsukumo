import { describe, expect, it } from "vitest"

import { reportViolations } from "../../../../../src/server/report/core/rules/index.ts"
import type { ReportBlock } from "../../../../../src/shared/report/report-block.ts"
import { draft } from "../../../../fixture/report-draft-block.ts"

describe("reportViolations の matrix", () => {
  it("セルの数が揃わない行のある matrix は違反", () => {
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

  it.each([
    ["列の数と揃わない", ["0円"], [{ kind: "ragged-table", count: 1 }]],
    ["列の数と揃う", ["0円", "500円"], []],
  ])("末尾の値の行が %s とき", (_, cells, expected) => {
    const matrix: ReportBlock = {
      kind: "matrix",
      title: "架空の対応",
      columns: ["列A", "列B"],
      rows: [{ name: "行1", cells: ["ok", { status: "warn", note: "7日まで" }] }],
      footer: [{ name: "月額", cells }],
      fold: "",
      aside: "",
    }
    expect(reportViolations(draft([matrix]))).toEqual(expected)
  })

  it.each([
    ["列の数と同じ位置", 2, [{ kind: "emphasis-column-range", count: 1 }]],
    ["最後の列", 1, []],
  ])("採った列が %s のとき", (_, emphasisColumn, expected) => {
    const matrix: ReportBlock = {
      kind: "matrix",
      title: "架空の対応",
      columns: ["列A", "列B"],
      rows: [{ name: "行1", cells: ["ok", "na"] }],
      emphasisColumn,
      fold: "",
      aside: "",
    }
    expect(reportViolations(draft([matrix]))).toEqual(expected)
  })
})
