// 読み手が後続の課題で付くまでの、期限つきの例外の表。読み手が付いた行は外す。

type PendingReaderBase = {
  readonly file: string
  readonly reason: string
  readonly removeWhen: string
}

export type PendingReader = PendingReaderBase &
  (
    | { readonly missingReader: "browser" }
    | { readonly missingReader: "production"; readonly exportName: string }
  )

export const PENDING_READERS: readonly PendingReader[] = [
  {
    file: "src/server/report/core/export/report-export-document.ts",
    missingReader: "production",
    exportName: "buildReportExportDocument",
    reason: "最終レポートの書き出しの核。書く・開くの口が後段のタスクで付く",
    removeWhen: "書き出しの口が文書を組む関数を呼ぶ",
  },
  {
    file: "src/server/report/core/export/report-export-file-name.ts",
    missingReader: "production",
    exportName: "reportExportFileName",
    reason: "最終レポートの書き出しの核。書く・開くの口が後段のタスクで付く",
    removeWhen: "書き出しの口がファイル名を決める関数を呼ぶ",
  },
  {
    file: "src/shared/report/a2ui-report-input.ts",
    missingReader: "browser",
    reason: "草稿の組み立てが読まなくなり、server の引数の字数の数え直しだけが読む",
    removeWhen: "旧い引数の形への組み直しをやめる（ADR 0043 の順 8）",
  },
  {
    file: "src/shared/utils/byte-length.ts",
    missingReader: "browser",
    reason: "UTF-8 のバイト数の物差しは server の4か所だけが読み、browser に読み手がまだ無い",
    removeWhen: "browser が UTF-8 のバイト数を数える場面を持つ、または server 専用の置き場に戻す",
  },
  {
    file: "src/shared/item/item-asset.ts",
    missingReader: "browser",
    reason:
      "アイテムの素材の URL の作り方・読み方は server の3か所だけが読み、browser に読み手がまだ無い",
    removeWhen:
      "browser がアイテムの素材の URL を組む・読む場面を持つ、または server 専用の置き場に戻す",
  },
  {
    file: "src/browser/components/ui/theme-root/tsukumo-theme.ts",
    missingReader: "production",
    exportName: "tsukumoTheme",
    reason:
      "読むのは `astryx theme build`（`theme:build` と lint の `--check`）で、`src/`・`scripts/` の import には現れない",
    removeWhen: "外部の道具が読む export を、この検査が読み手として数える",
  },
]

/** `"production"` の行から、`<パス>#<名前>` と理由の対応を作る。 */
export function pendingProductionExports(
  rows: readonly PendingReader[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    rows.flatMap((row) =>
      row.missingReader === "production" ? [[`${row.file}#${row.exportName}`, row.reason]] : [],
    ),
  )
}

/** `"browser"` の行の `file` から `src/` を外した相対パスの集合を作る。 */
export function pendingBrowserReaderFiles(rows: readonly PendingReader[]): ReadonlySet<string> {
  return new Set(
    rows.flatMap((row) =>
      row.missingReader === "browser" ? [row.file.replace(/^src\//, "")] : [],
    ),
  )
}
