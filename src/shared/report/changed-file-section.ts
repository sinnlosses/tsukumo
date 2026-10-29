// 最終レポートの頭に出す「変更したファイル n」の畳んだ節。一覧は変更の札（`ReportChangeSummary`）の `changed`。

import { countBy } from "remeda"

import type { ChangedFile } from "./changed-file.ts"
import type { ReportChangeSummary } from "./report-change-summary.ts"
import { FILE_CHANGE_ORDER } from "./report-file-markdown.ts"
import { type FileTreeRow, fileTreeRows } from "./report-file-tree.ts"

/**
 * 畳んだ節を描く順に並べ終えた値。変更が無ければ `none`。
 * `rows` は樹形図の行、`totals` は件数が1つでもある種別だけを `FILE_CHANGE_ORDER` の順で並べた合計の札。
 */
export type ChangedFilesView =
  | { readonly kind: "none" }
  | {
      readonly kind: "files"
      readonly count: number
      readonly rows: readonly FileTreeRow<ChangedFile>[]
      readonly totals: readonly {
        readonly change: ChangedFile["change"]
        readonly count: number
      }[]
    }

export function changedFilesView(summary: ReportChangeSummary): ChangedFilesView {
  if (summary.kind === "none" || summary.changed.length === 0) {
    return { kind: "none" }
  }
  const counts = countBy(summary.changed, (file) => file.change)
  return {
    kind: "files",
    count: summary.changed.length,
    rows: fileTreeRows(summary.changed, (file) => file.path),
    totals: FILE_CHANGE_ORDER.flatMap((change) => {
      if (change === "read") {
        return []
      }
      const count = counts[change] ?? 0
      return count > 0 ? [{ change, count }] : []
    }),
  }
}
