import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { findUnclosedBold, formatUnclosedBold } from "../../scripts/document/closing-bold.ts"
import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"

// 太字の閉じの直後に空白も約物も無いと、Markdown が太字を閉じない。
// docs/history/ は凍結した記録なので見ない。

const FROZEN_DIRECTORY = "docs/history"

function listMarkdown(directory: string): readonly string[] {
  return readdirSync(join(REPOSITORY_ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (path === FROZEN_DIRECTORY) return []
    if (entry.isDirectory()) return listMarkdown(path)
    return entry.name.endsWith(".md") ? [path] : []
  })
}

describe("太字の閉じ", () => {
  it("docs・README.md・AGENTS.md に、太字が閉じない行は無い", () => {
    const violations = [...listMarkdown("docs"), "README.md", "AGENTS.md"].flatMap((path) =>
      findUnclosedBold(readFileSync(join(REPOSITORY_ROOT, path), "utf8")).map((found) =>
        formatUnclosedBold(path, found),
      ),
    )
    expect(violations).toEqual([])
  })
})
