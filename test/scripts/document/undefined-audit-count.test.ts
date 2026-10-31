import { describe, expect, it } from "vitest"

import { findUndefinedAuditViolations } from "../../../scripts/document/undefined-audit-count.ts"

type Parts = {
  readonly count?: string
  readonly rowA?: string
  readonly total?: string
  readonly reasonA?: string
  readonly reasonB?: string
  readonly kindSum?: string
}

function audit(parts: Parts = {}): string {
  return [
    "# 題",
    "",
    `全 ${parts.count ?? "30"} 件。`,
    "",
    "## 結果",
    "",
    "| 領域 | 全件 | 6つに当たる | 要確認のうち消せる | 本物 |",
    "| ---- | ---- | ---- | ---- | ---- |",
    parts.rowA ?? "| `a` | 10 | 1 | 2 | 7 |",
    "| `b` | 20 | 4 | 6 | 10 |",
    parts.total ?? "| **合計** | **30** | **5** | **8** | **17** |",
    "",
    "## 本物の理由",
    "",
    "### 理由の種類と代表例",
    "",
    "| 記号 | 理由 | 件 | 代表例 |",
    "| ---- | ---- | ---- | ---- |",
    `| R1 | 失敗 | ${parts.kindSum ?? "12"} | x |`,
    "| R2 | 外 | 5 | y |",
    "",
    "### 領域ごとの理由",
    "",
    "| 領域 | 本物 | 理由の内訳 |",
    "| ---- | ---- | ---- |",
    parts.reasonA ?? "| `a` | 7 | R1 5（例 x）、R2 2（例 y） |",
    parts.reasonB ?? "| `b` | 10 | R1 7（例 x）、R2 3（例 y） |",
    "",
  ].join("\n")
}

function messages(parts: Parts): string[] {
  return findUndefinedAuditViolations(audit(parts)).map((violation) => violation.message)
}

describe("findUndefinedAuditViolations", () => {
  it("数が合う本文では空", () => {
    expect(findUndefinedAuditViolations(audit())).toEqual([])
  })

  it("領域の表の1行の数を1つ変えると、行・合計行・理由の表の3件が出る", () => {
    const found = messages({ rowA: "| `a` | 10 | 1 | 2 | 8 |" })
    expect(found).toHaveLength(3)
    expect(found[0]).toContain("`a`: 全件 10")
  })

  it("行の和が合わない行を1件出す", () => {
    const found = messages({
      rowA: "| `a` | 11 | 1 | 2 | 7 |",
      total: "| **合計** | **31** | **5** | **8** | **17** |",
      count: "31",
    })
    expect(found).toEqual(["`a`: 全件 11 が 6つに当たる 1 + 消せる 2 + 本物 7 と合わない"])
  })

  it("合計行が列の和と合わない", () => {
    expect(messages({ total: "| **合計** | **30** | **5** | **9** | **17** |" })).toEqual([
      "合計行の 消せる 9 が行の和 8 と合わない",
    ])
  })

  it("本文の「全 N 件」が合計と合わない", () => {
    expect(messages({ count: "29" })).toEqual(["本文の「全 29 件」が合計行の全件 30 と合わない"])
  })

  it("理由の表の本物が領域の表と合わない", () => {
    const found = messages({ reasonA: "| `a` | 6 | R1 5（例 x）、R2 1（例 y） |" })
    expect(found).toEqual(["`a`: 理由の表の本物 6 が領域の表の本物 7 と合わない"])
  })

  it("理由の内訳の和が本物と合わない", () => {
    const found = messages({ reasonB: "| `b` | 10 | R1 7（例 x）、R2 2（例 y） |" })
    expect(found).toEqual(["`b`: 理由の内訳の和 9 が本物 10 と合わない"])
  })

  it("理由の表に領域が足りない・余る", () => {
    expect(messages({ reasonB: "| `c` | 10 | R1 10（例 x） |" })).toEqual([
      "`c`: 領域の表に無い領域",
      "`b`: 本物があるのに理由の表に行が無い",
    ])
  })

  it("理由の種類の表の件の和が合計の本物と合わない", () => {
    expect(messages({ kindSum: "13" })).toEqual([
      "理由の種類の表の件の和 18 が合計行の本物 17 と合わない",
    ])
  })

  it("領域の表が無い本文は読めないと出す", () => {
    expect(findUndefinedAuditViolations("# 題\n")).not.toEqual([])
  })
})
