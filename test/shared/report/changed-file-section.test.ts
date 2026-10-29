import { describe, expect, it } from "vitest"

import { changedFilesView } from "../../../src/shared/report/changed-file-section.ts"
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

describe("changedFilesView の行", () => {
  const pathsOf = (changed: readonly ChangedFile[]) => {
    const view = changedFilesView(counted(changed))
    return view.kind === "files"
      ? view.rows.flatMap((row) => (row.kind === "file" ? [row.item.path] : []))
      : []
  }

  it("入力のパスが全部、樹形図の行に残る", () => {
    expect(pathsOf(CHANGED).toSorted()).toEqual(CHANGED.map(({ path }) => path).toSorted())
  })

  it("入力から外したパスは行に残らない", () => {
    expect(pathsOf(CHANGED.slice(1))).not.toContain(CHANGED[0]?.path ?? "")
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
