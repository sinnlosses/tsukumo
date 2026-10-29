// ファイルの塊（`files`）を HTML に組む。種別の札・パスの樹形図・注記もここが持つ。

import { countBy } from "remeda"

import type { ReportBlock } from "./report-block.ts"
import { fileTreeRows } from "./report-file-tree.ts"
import { htmlAttribute, htmlInline, htmlInlineWithCode } from "./report-inline-markdown.ts"

/** ファイルの変更の種別 → 札の記号・語・見た目の class（色は `report-notation.module.css` 側が持つ）。 */
export const FILE_CHANGE_BADGES = {
  added: { symbol: "+", label: "追加", className: "file-change-added" },
  modified: { symbol: "~", label: "変更", className: "file-change-modified" },
  deleted: { symbol: "-", label: "削除", className: "file-change-deleted" },
  read: { symbol: "·", label: "読んだ", className: "file-change-read" },
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "files" }>["items"][number]["change"],
  { readonly symbol: string; readonly label: string; readonly className: string }
>

/** 塊の頭の合計の札と、行ごとの札を並べる順。 */
export const FILE_CHANGE_ORDER = [
  "added",
  "modified",
  "deleted",
  "read",
] as const satisfies readonly (keyof typeof FILE_CHANGE_BADGES)[]

/**
 * 塊の頭に、種別ごとの合計の札を右寄せで並べ、パスから組んだ樹形図の行（フォルダの行・ファイルの行）を続ける。
 * ファイル名は `code` 要素にし、フルパスを `data-file-path` に持たせる。git 管理下のパスなら描く側の `Code` が
 * その属性で判定して押せるボタンにする（パスの中の inline code の記法は解かない）。
 * 枝の罫は読み上げに出さない。フォルダの無いパスだけのときは罫もフォルダの行も出さない。
 */
export function filesMarkdown(block: Extract<ReportBlock, { readonly kind: "files" }>): string {
  const summaryHtml = filesSummaryHtml(block.items)
  const diffMax = Math.max(0, ...block.items.map((item) => fileDiffAmount(item.note)))
  const rows = fileTreeRows(block.items, (item) => item.path).map((row) => {
    if (row.kind === "folder") {
      const nameHtml = pathBreakHtml(htmlInline(row.name))
      return `<div class="file-folder">${fileGuideHtml(row.guide)}<span class="file-path-folder">${nameHtml}</span></div>`
    }
    const { path, change, note } = row.item
    const nameHtml = `<span class="file-path-name">${pathBreakHtml(htmlInline(row.name))}</span>`
    const noteHtml = fileNoteHtml(change, note) + fileDiffHtml(fileDiffAmount(note), diffMax)
    const badgeHtml = fileChangeBadgeHtml(change, "")
    if (row.guide === "" && !path.includes("/")) {
      return `<div class="file">${badgeHtml}<code>${nameHtml}</code>${noteHtml}</div>`
    }
    const codeHtml = `<code data-file-path="${htmlAttribute(path)}">${nameHtml}</code>`
    return `<div class="file">${badgeHtml}<span class="file-entry">${fileGuideHtml(row.guide)}${codeHtml}</span>${noteHtml}</div>`
  })
  return `<div class="files">${rows.join("")}${summaryHtml}</div>`
}

/**
 * パスの折り返しの機会を `/` の直後だけにする。
 * `/` の後に `<wbr>` を置き、ハイフンの後は空の `path-glue`（CSS が見えない結合子を付けて折れなくする）を置く。
 */
function pathBreakHtml(escapedPath: string): string {
  return escapedPath.replaceAll("/", "/<wbr>").replaceAll("-", '-<span class="path-glue"></span>')
}

function fileGuideHtml(guide: string): string {
  return guide === "" ? "" : `<span class="file-branch" aria-hidden="true">${guide}</span>`
}

/** 種別ごとの件数が1つでもある札だけを、`FILE_CHANGE_ORDER` の順で並べる。 */
function filesSummaryHtml(
  items: Extract<ReportBlock, { readonly kind: "files" }>["items"],
): string {
  const counts = countBy(items, (item) => item.change)
  const badges = FILE_CHANGE_ORDER.filter((change) => (counts[change] ?? 0) > 0).map((change) =>
    fileChangeBadgeHtml(change, ` ${counts[change]}`),
  )
  return `<div class="files-summary">${badges.join("")}</div>`
}

function fileChangeBadgeHtml(change: keyof typeof FILE_CHANGE_BADGES, countSuffix: string): string {
  const badge = FILE_CHANGE_BADGES[change]
  return (
    `<span class="file-change ${badge.className}">` +
    `<span class="file-change-symbol">${badge.symbol}</span>${badge.label}${countSuffix}</span>`
  )
}

const DIFF_AMOUNT_PATTERN = /^\s*(?:\+(\d+))?\s*(?:[−-](\d+))?(?!\d)/

/** `note` の先頭の `+n −m`（`+n` だけ・`−m` だけも。マイナスは全角も半角も）の n + m。読めなければ 0。 */
function fileDiffAmount(note: string): number {
  const match = DIFF_AMOUNT_PATTERN.exec(note)
  return Number(match?.[1] ?? 0) + Number(match?.[2] ?? 0)
}

function fileDiffHtml(amount: number, max: number): string {
  if (amount <= 0) {
    return ""
  }
  const width = Math.round((amount / max) * 100)
  return (
    `<span class="file-diff" aria-hidden="true"><span class="cell-numeric">` +
    `<span class="cell-bar" style="width: ${String(width)}%"></span>` +
    `<span class="cell-numeric-value">&nbsp;</span></span></span>`
  )
}

/** 追加で説明が無い行は「新しく作った」を補足色で入れ、ほかの種別で説明が無い行は列を空にする。 */
function fileNoteHtml(change: keyof typeof FILE_CHANGE_BADGES, note: string): string {
  if (note.trim() !== "") {
    return `<span class="file-note">${htmlInlineWithCode(note)}</span>`
  }
  return change === "added" ? '<span class="file-note file-note-empty">新しく作った</span>' : ""
}
