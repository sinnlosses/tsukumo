// 入口を実際に起こして、3 つの余白が 4 行で出ることを確かめる。

import process from "node:process"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

import {
  REPORT_INPUT_SCHEMA_MAX_CHARS,
  SYSTEM_PROMPT_TOTAL_LIMIT,
} from "../../../scripts/shared/addition-budget.ts"
import { runSubprocess } from "../../fixture/subprocess.ts"

const ENTRY = fileURLToPath(new URL("../../../scripts/dev/addition-margin.ts", import.meta.url))

describe("addition-margin", () => {
  test("4 行を 名前・いま・上限・残り で出し、残りは 上限 − いま", async () => {
    const result = await runSubprocess(process.execPath, [ENTRY])

    expect(result.exitCode).toBe(0)
    const rows = result.stdout
      .trimEnd()
      .split("\n")
      .map((line) => line.split("\t"))
    expect(rows.map((row) => row.length)).toEqual([4, 4, 4, 4])
    expect(rows.map((row) => row[0])).toEqual([
      "systemPrompt の規約 4 本の合計（字）",
      "report の引数の schema（字）",
      "scripts/dev/lib/a2ui-write-trial.ts（トークン）",
      "test/browser/features/report/a2ui-surface.test.tsx（トークン）",
    ])
    expect(rows.map((row) => Number(row[2])).slice(0, 2)).toEqual([
      SYSTEM_PROMPT_TOTAL_LIMIT,
      REPORT_INPUT_SCHEMA_MAX_CHARS,
    ])
    for (const [, current, limit, remaining] of rows) {
      expect(Number(remaining)).toBe(Number(limit) - Number(current))
      expect(Number(remaining)).toBeGreaterThanOrEqual(0)
    }
  })
})
