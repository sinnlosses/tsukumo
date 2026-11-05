// ファイルの変更の種別ごとの札（記号・語・見た目の class）と、札を並べる順。

import type { LeafComponent } from "./report-block.ts"

/** ファイルの変更の種別 → 札の記号・語・見た目の class（色は `report-notation.module.css` 側が持つ）。 */
export const FILE_CHANGE_BADGES = {
  added: { symbol: "+", label: "追加", className: "file-change-added" },
  modified: { symbol: "~", label: "変更", className: "file-change-modified" },
  deleted: { symbol: "-", label: "削除", className: "file-change-deleted" },
  read: { symbol: "·", label: "読んだ", className: "file-change-read" },
} as const satisfies Record<
  Extract<LeafComponent, { readonly kind: "files" }>["items"][number]["change"],
  { readonly symbol: string; readonly label: string; readonly className: string }
>

/** 合計の札と、行ごとの札を並べる順。 */
export const FILE_CHANGE_ORDER = [
  "added",
  "modified",
  "deleted",
  "read",
] as const satisfies readonly (keyof typeof FILE_CHANGE_BADGES)[]
