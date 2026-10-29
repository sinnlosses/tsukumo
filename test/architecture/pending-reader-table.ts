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
    file: "src/shared/report/body-fence.ts",
    missingReader: "browser",
    reason: "旧い body の読みは旧い記録の組み直し（server）だけが使う",
    removeWhen: "body-fence を旧い記録の組み直しへ畳む（ADR 0043 の順 7 の次の課題）",
  },
  {
    file: "src/shared/report/body-fence-reader.ts",
    missingReader: "browser",
    reason: "旧い body の読みは旧い記録の組み直し（server）だけが使う",
    removeWhen: "body-fence を旧い記録の組み直しへ畳む（ADR 0043 の順 7 の次の課題）",
  },
  {
    file: "src/shared/report/body-figure-fence.ts",
    missingReader: "browser",
    reason: "旧い body の読みは旧い記録の組み直し（server）だけが使う",
    removeWhen: "body-fence を旧い記録の組み直しへ畳む（ADR 0043 の順 7 の次の課題）",
  },
  {
    file: "src/shared/report/a2ui-report-input.ts",
    missingReader: "browser",
    reason: "草稿の組み立てが読まなくなり、server の引数の字数の数え直しだけが読む",
    removeWhen: "旧い引数の形への組み直しをやめる（ADR 0043 の順 8）",
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
