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
    file: "src/shared/report/report-outline.ts",
    missingReader: "browser",
    reason: "server からだけ読まれている",
    removeWhen: "browser のレポートの描画がこのファイルを読んだら",
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
