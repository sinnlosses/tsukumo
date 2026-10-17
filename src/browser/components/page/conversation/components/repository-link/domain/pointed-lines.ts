// レポートに書かれたパスの末尾（`:12` / `:12:5` / `:10-14`）が指す行。

/** パスの末尾に書かれた行。`:12:5` の桁は行に数えない。 */
export type PointedLines = { readonly kind: "none" } | LineRange

/** 頭と終わりの行（どちらも含む。1 から数える）。 */
export type LineRange = {
  readonly kind: "lines"
  readonly startLine: number
  readonly endLine: number
}
