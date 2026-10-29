import { describe, expect, it } from "vitest"

import {
  changedFilesMarkdown,
  changedFilesView,
} from "../../../src/shared/report/changed-file-section.ts"
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

describe("changedFilesView", () => {
  it("数えていない札と、変更が 0 ファイルの札は none", () => {
    expect(changedFilesView({ kind: "none" })).toEqual({ kind: "none" })
    expect(changedFilesView(counted([]))).toEqual({ kind: "none" })
  })

  it("件数と樹形図の行と、件数のある種別だけの合計の札を追加・変更・削除の順で持つ", () => {
    const view = changedFilesView(
      counted([
        { path: "src/架空/b.ts", change: "modified" },
        { path: "src/架空/a.ts", change: "added" },
        { path: "src/架空/c.ts", change: "modified" },
      ]),
    )

    expect(view).toEqual({
      kind: "files",
      count: 3,
      rows: [
        { kind: "folder", guide: "", name: "src/架空/" },
        {
          kind: "file",
          guide: "├── ",
          name: "b.ts",
          item: { path: "src/架空/b.ts", change: "modified" },
        },
        {
          kind: "file",
          guide: "├── ",
          name: "a.ts",
          item: { path: "src/架空/a.ts", change: "added" },
        },
        {
          kind: "file",
          guide: "└── ",
          name: "c.ts",
          item: { path: "src/架空/c.ts", change: "modified" },
        },
      ],
      totals: [
        { change: "added", count: 1 },
        { change: "modified", count: 2 },
      ],
    })
  })
})
