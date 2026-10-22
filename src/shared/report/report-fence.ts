// Markdown のフェンス（柵）の読み。

/** フェンスの開き（CommonMark。行頭の空白は3つまで、`` ` `` か `~` を3つ以上）。 */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/

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
    const opening = openingFence(line)
    return { flags: [...state.flags, opening !== undefined], marker: opening }
  }, initial).flags
}

/** 行がフェンスの開きなら、その記号を返す。 */
function openingFence(line: string): string | undefined {
  return FENCE_OPEN.exec(line)?.[1]
}

/** フェンスの閉じか（開きと同じ文字を、開き以上の数だけ並べた行）。 */
function closesFence(line: string, marker: string): boolean {
  const trimmed = line.trim()
  return (
    /^ {0,3}\S/.test(line) &&
    trimmed.length >= marker.length &&
    [...trimmed].every((char) => char === marker[0])
  )
}
