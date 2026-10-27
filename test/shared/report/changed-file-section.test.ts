import { describe, expect, it } from "vitest"

import { changedFilesMarkdown } from "../../../src/shared/report/changed-file-section.ts"
import type { ChangedFile } from "../../../src/shared/report/changed-file.ts"
import type { ReportChangeSummary } from "../../../src/shared/report/report-change-summary.ts"

const counted = (changed: readonly ChangedFile[]): ReportChangeSummary => ({
  kind: "counted",
  changed,
  files: changed.length,
  added: 0,
  removed: 0,
  mixed: false,
})

const CHANGED: readonly ChangedFile[] = [
  { path: "src/架空/a.ts", change: "added" },
  { path: "src/架空/b.ts", change: "modified" },
  { path: "docs/架空/c.md", change: "deleted" },
]

describe("changedFilesMarkdown", () => {
  it("追加・変更・削除の一覧を、件数つきの畳みの中に files の樹形図で出す", () => {
    const markdown = changedFilesMarkdown(counted(CHANGED))

    expect(markdown.startsWith("<details><summary>変更したファイル 3</summary>")).toBe(true)
    expect(markdown.endsWith("</details>")).toBe(true)
    expect(markdown).toContain('<div class="files">')
    expect(markdown).toContain("file-change-added")
    expect(markdown).toContain("file-change-modified")
    expect(markdown).toContain("file-change-deleted")
  })

  it("入力のパスが全部出力に残る", () => {
    const markdown = changedFilesMarkdown(counted(CHANGED))

    for (const { path } of CHANGED) {
      expect(markdown).toContain(`data-file-path="${path}"`)
    }
    const dropped = changedFilesMarkdown(counted(CHANGED.slice(1)))
    expect(dropped).not.toContain(`data-file-path="${CHANGED[0]?.path ?? ""}"`)
  })

  it("数えていない札と、変更が 0 ファイルの札は空文字", () => {
    expect(changedFilesMarkdown({ kind: "none" })).toBe("")
    expect(changedFilesMarkdown(counted([]))).toBe("")
  })
})
