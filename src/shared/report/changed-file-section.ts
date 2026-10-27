// 最終レポートの頭に出す「変更したファイル n」の畳んだ節。一覧は変更の札（`ReportChangeSummary`）の `changed`。

import type { ReportChangeSummary } from "./report-change-summary.ts"
import { filesMarkdown } from "./report-file-markdown.ts"

export function changedFilesMarkdown(summary: ReportChangeSummary): string {
  if (summary.kind === "none" || summary.changed.length === 0) {
    return ""
  }
  const tree = filesMarkdown({
    kind: "files",
    items: summary.changed.map(({ path, change }) => ({ path, change, note: "" })),
    title: "",
    fold: "",
    aside: "",
  })
  return `<details><summary>変更したファイル ${String(summary.changed.length)}</summary>\n\n${tree}\n\n</details>`
}
