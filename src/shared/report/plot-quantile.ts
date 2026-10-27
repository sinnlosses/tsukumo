// 散布図の外れ値とヒストグラムの階級幅が共に使う、並べ替えた数列の分位点。

/** 昇順に並べた数列の `p`（0〜1）分位点。隣り合う値を線形に補間する。空なら 0。 */
export function quantileOf(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const low = sorted[lower] ?? 0
  const high = sorted[upper] ?? low
  return low + (high - low) * (position - lower)
}
