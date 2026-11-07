import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

import {
  AGENTS_MD_LIMIT,
  IMPLEMENTER_BRIEF_LIMIT,
  RULES_TOTAL_LIMIT,
  SYSTEM_PROMPT_TOTAL_LIMIT,
  TASK_WRITING_LIMIT,
} from "../../scripts/shared/addition-budget.ts"
import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { REPOSITORY_SCAN_TIMEOUT_MS } from "../fixture/repository-scan-timeout.ts"

// 常設の文章の上限の値は、各 LIMIT 定数だけが持つ。
// 文書は定数の名前で指し、値を字数として書き写さない。

const LIMITS = [
  AGENTS_MD_LIMIT,
  RULES_TOTAL_LIMIT,
  SYSTEM_PROMPT_TOTAL_LIMIT,
  TASK_WRITING_LIMIT,
  IMPLEMENTER_BRIEF_LIMIT,
] as const

function withThousandsSeparator(value: number): string {
  return value.toLocaleString("en-US")
}

function findLimitCopies(text: string, limits: readonly number[]): readonly number[] {
  return limits.filter((limit) => {
    const forms = [String(limit), withThousandsSeparator(limit)]
    return forms.some((form) => new RegExp(`(?<![\\d,])${form} ?字`).test(text))
  })
}

function listMarkdownFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "history" ? [] : listMarkdownFiles(path)
    }
    return entry.name.endsWith(".md") ? [path] : []
  })
}

describe("常設の文章の上限の値", () => {
  it("字数として書いた文字列を見つけ、別の数の一部は拾わない", () => {
    expect(findLimitCopies("合計が6,504字", [6504])).toEqual([6504])
    expect(findLimitCopies("合計が6504 字", [6504])).toEqual([6504])
    expect(findLimitCopies("約 24,000 字", [4000])).toEqual([])
    expect(findLimitCopies("定数名で指す", [6504])).toEqual([])
  })

  it(
    "docs/（history を除く）・AGENTS.md・README.md に字数として書き写さない",
    () => {
      const files = [
        ...listMarkdownFiles(join(REPOSITORY_ROOT, "docs")),
        join(REPOSITORY_ROOT, "AGENTS.md"),
        join(REPOSITORY_ROOT, "README.md"),
      ]
      const copies = files.flatMap((path) =>
        findLimitCopies(readFileSync(path, "utf8"), LIMITS).map(
          (limit) => `${relative(REPOSITORY_ROOT, path)}: ${limit}`,
        ),
      )

      expect(copies).toEqual([])
    },
    REPOSITORY_SCAN_TIMEOUT_MS,
  )
})
