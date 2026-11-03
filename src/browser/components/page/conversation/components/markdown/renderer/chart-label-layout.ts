// グラフの線と棒の端に直接書く字の置き場と、字のために取る余白の計算。描かずに数だけを返す。

export const LABEL_OFFSET = 8
export const BAR_END_GAP = 6
export const ARROW_HEAD = 7
export const SERIES_SIDE_PADDING = 90
export const NAME_COLUMN_GAP = 12
export const NAME_ROW_PADDING = 22
export const SHARE_MARK_SIZE = 8
const SHARE_MARK_GAP = 5
export const SHARE_MARK_WIDTH = SHARE_MARK_SIZE + SHARE_MARK_GAP
const SHARE_INSIDE_PADDING = 6
const SHARE_TEXT_GAP = 10

type ShareSegment = {
  /** 部分の幅（px）。 */
  readonly width: number
  /** 名前と割合を並べた字の幅（px）。 */
  readonly textWidth: number
}

export type ShareLabelPlace = {
  /** -1 は棒の中。0 以上は棒の下の行の番号。 */
  readonly row: number
  /** 棒の中は字の左端、棒の下は部分の色の四角の左端（px。棒の左端を 0 とする）。字は四角の右に続く。 */
  readonly left: number
}

export type Padding = ChartInstance["options"]["layout"]["padding"]

/**
 * 縦の位置 `ys` が近いものを、上から順に押し下げて離す。返す並びは入力と同じ順。
 * 隣り合う札の中心の間は、2つの高さ（`heights`。省くと `gap`）の平均を空ける。
 */
export function spreadLabels(
  ys: readonly number[],
  gap: number,
  heights: readonly number[] = ys.map(() => gap),
): number[] {
  const order = ys.map((_, index) => index).toSorted((a, b) => (ys[a] ?? 0) - (ys[b] ?? 0))
  const spread = [...ys]
  let previous = Number.NEGATIVE_INFINITY
  let previousHeight = gap
  for (const index of order) {
    const height = heights[index] ?? gap
    const placed = Math.max(ys[index] ?? 0, previous + (previousHeight + height) / 2)
    spread[index] = placed
    previous = placed
    previousHeight = height
  }
  return spread
}

/**
 * 線端の系列名の札を行に分ける。`limit`（右の余白の上限）に収まるなら1行。
 * 収まらず、先頭より後ろに開き括弧があるときは、最後の開き括弧の前で2行に折る。括弧が無ければ1行のまま。
 */
export function lineEndLabelLines(
  text: string,
  measure: (text: string) => number,
  limit: number,
): string[] {
  if (measure(text) + LABEL_OFFSET <= limit) {
    return [text]
  }
  const open = Math.max(text.lastIndexOf("（"), text.lastIndexOf("("))
  return open > 0 ? [text.slice(0, open), text.slice(open)] : [text]
}

/** 線端の札の右の余白。折ったあとの行の幅の最大に字の間隔を足し、`limit` を上限にする。札が無ければ 0。 */
export function lineEndPadding(lineWidths: readonly number[], limit: number): number {
  return lineWidths.length === 0 ? 0 : Math.min(limit, Math.max(...lineWidths) + LABEL_OFFSET)
}

/**
 * arrow の図の左右の余白。前後の数字は矢じりのそばに書くので、値が軸の端に近いと数字が描く領域の外へはみ出す（`overhang`）。
 * 左は、そのはみ出しの外側に項目名の列（`nameWidth`）を取る。矢じりの無い span は `head` を 0 にする。
 */
export function arrowPadding(
  nameWidth: number,
  valueWidth: number,
  head: number = ARROW_HEAD,
): { readonly left: number; readonly right: number; readonly overhang: number } {
  const overhang = head + LABEL_OFFSET + valueWidth
  return { left: nameWidth + NAME_COLUMN_GAP + overhang, right: overhang, overhang }
}

/** 棒の端に書く字。系列名を値の前に添える（系列が2つ以上のとき、各系列の先頭の棒だけ）。 */
export function barEndText(seriesName: string, value: unknown): string {
  return `${seriesName}  ${String(value)}`
}

export function barValueText(value: unknown): string {
  return String(value)
}

/**
 * bar の端の字が描く領域の外へはみ出さないための余白。横棒は右に字の幅（`textWidth`）、縦棒は上に1行。
 * 系列が2つ以上の横棒は、系列名の分（`SERIES_SIDE_PADDING`）より狭くしない。
 */
export function barEndPadding(
  horizontal: boolean,
  seriesCount: number,
  textWidth: number,
): Padding {
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  if (!horizontal) {
    return { ...none, top: NAME_ROW_PADDING }
  }
  const named = seriesCount >= 2 ? SERIES_SIDE_PADDING : 0
  return { ...none, right: Math.max(named, BAR_END_GAP + textWidth) }
}

/**
 * share の部分ごとの字の置き場。幅に収まる部分は棒の中、収まらない部分（幅0を含む）は部分の色の四角と字を
 * 部分の中心に置いて棒の下の行へ出し、先に置いたものと横で重ならない最小の行にする。`total` は棒の全幅で、四角と字は端からはみ出さない。
 */
export function shareLabelRows(
  segments: readonly ShareSegment[],
  total: number,
): ShareLabelPlace[] {
  const rows: { readonly left: number; readonly right: number }[][] = []
  let start = 0
  return segments.map(({ width, textWidth }) => {
    const center = start + width / 2
    start += width
    if (textWidth + SHARE_INSIDE_PADDING * 2 <= width) {
      return { row: -1, left: center - textWidth / 2 }
    }
    const unitWidth = SHARE_MARK_WIDTH + textWidth
    const left = Math.max(0, Math.min(center - unitWidth / 2, total - unitWidth))
    const right = left + unitWidth
    let row = 0
    while (
      (rows[row] ?? []).some(
        (placed) => left < placed.right + SHARE_TEXT_GAP && placed.left < right + SHARE_TEXT_GAP,
      )
    ) {
      row += 1
    }
    rows[row] = [...(rows[row] ?? []), { left, right }]
    return { row, left }
  })
}
