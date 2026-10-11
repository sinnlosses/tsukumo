// Markdown のフェンス（柵）の読み。

/** フェンスの開き（CommonMark。行頭の空白は3つまで、`` ` `` か `~` を3つ以上）。 */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** 開きの記号と、info 文字列の最初の語（無ければ空）。 */
export type FenceOpening = { readonly marker: string; readonly info: string }

/** 行がフェンスの開きなら、その記号と info を返す。 */
export function openingFence(line: string): FenceOpening | undefined {
  const match = FENCE_OPEN.exec(line)
  const marker = match?.[1]
  return marker === undefined
    ? undefined
    : { marker, info: (match?.[2] ?? "").trim().split(/\s+/)[0] ?? "" }
}

/** フェンスの閉じか（開きと同じ文字を、開き以上の数だけ並べた行）。 */
export function closesFence(line: string, marker: string): boolean {
  const trimmed = line.trim()
  return (
    /^ {0,3}\S/.test(line) &&
    trimmed.length >= marker.length &&
    [...trimmed].every((char) => char === marker[0])
  )
}

/**
 * 行ごとに、フェンスに属するか（開き・中身・閉じのどれか）。閉じの無いフェンスは末尾まで続く。
 */
export function fencedLineFlags(lines: readonly string[]): readonly boolean[] {
  const initial: { readonly flags: readonly boolean[]; readonly marker: string | undefined } = {
    flags: [],
    marker: undefined,
  }
  return lines.reduce((state, line) => {
    if (state.marker !== undefined) {
      return {
        flags: [...state.flags, true],
        marker: closesFence(line, state.marker) ? undefined : state.marker,
      }
    }
    const opening = openingFence(line)?.marker
    return { flags: [...state.flags, opening !== undefined], marker: opening }
  }, initial).flags
}
