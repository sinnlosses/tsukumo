import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"
import { REPORT_REJECTION_MODES } from "../../../src/server/report/core/rejection-mode.ts"

// `report` の差し戻しの条（`REPORT_REJECTION_MODES` の鍵）のどれにも、設計判断のアーカイブの根拠の節に1行があることを保つ。
// 条を足したら、その節に数えた記録の数と日付か「導入時は数えていない」を `- `名前`: …` の形で1行書く。

const DECISION_ARCHIVE = join("docs", "history", "decision.md")
const BASIS_HEADING = "## adr/0028 追記 差し戻しの条ごとの根拠"

describe("差し戻しの条の根拠", () => {
  const archive = readFileSync(join(REPOSITORY_ROOT, DECISION_ARCHIVE), "utf8")
  const start = archive.indexOf(`\n${BASIS_HEADING}\n`)
  const end = archive.indexOf("\n## ", start + 1)
  const section = start === -1 ? "" : archive.slice(start, end === -1 ? undefined : end)

  it("根拠の節がある", () => {
    expect(start, `${DECISION_ARCHIVE} に「${BASIS_HEADING}」の節が無い`).not.toBe(-1)
  })

  it("どの条も、根拠の節に `- `名前`: ` で始まる行を持つ", () => {
    const lines = section.split("\n")
    const missing = Object.keys(REPORT_REJECTION_MODES).filter(
      (reason) => !lines.some((line) => line.startsWith(`- \`${reason}\`: `)),
    )
    expect(missing, `${DECISION_ARCHIVE} に根拠の行が無い条: ${missing.join(", ")}`).toEqual([])
  })
})
