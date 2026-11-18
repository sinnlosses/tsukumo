// 格子（`Grid`）の列の数。書き手は列の数を書かないので、格子の幅から描く側が決める。

/** 子1つが潰れずに読める最小の幅（em）。1400×900 の紙で3列、1920×1080 で4列、390×844 で1列になる値。 */
const GRID_CELL_MIN_EM = 14

type GridMeasure = {
  readonly childCount: number
  /** 格子の内側の幅（px）。0 はまだ置かれていない。 */
  readonly inlineSize: number
  readonly fontSize: number
  /** 列の間（px）。 */
  readonly gap: number
  /** 余白の札の横に来ている。 */
  readonly besideCard: boolean
}

/**
 * 格子に入る列の数を出し、子の数より多ければ子の数に縮め、段の数を変えずに列を均す（4つで3列入るなら 2×2）。
 * 余白の札の横とまだ置かれていない格子は1列。
 */
export function gridColumnCount(measure: GridMeasure): number {
  const { childCount, inlineSize, fontSize, gap, besideCard } = measure
  if (besideCard || inlineSize <= 0 || childCount <= 1) {
    return 1
  }
  const cellMin = GRID_CELL_MIN_EM * fontSize
  const fit = Math.max(1, Math.floor((inlineSize + gap) / (cellMin + gap)))
  const columns = Math.min(childCount, fit)
  const rows = Math.ceil(childCount / columns)
  return Math.ceil(childCount / rows)
}
