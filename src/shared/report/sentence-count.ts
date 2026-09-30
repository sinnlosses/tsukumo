// 文の数え方。「1〜2文で書く」の類いの条を機械で確かめるときの物差し。

/**
 * 文の数。句点（`。` `！` `？`）で数え、句点で終わらない末尾も1文と数える。
 * inline code と全角の丸括弧の中は数えない（括弧の中の句点で文を割らない）。
 */
export function sentenceCount(text: string): number {
  const plain = text
    .replace(/`[^`\n]*`/g, "")
    .replace(/（[^（）]*）/g, "")
    .trim()
  if (plain === "") {
    return 0
  }
  const terminated = [...plain.matchAll(/[。！？]+/g)].length
  return /[。！？]$/.test(plain) ? terminated : terminated + 1
}
