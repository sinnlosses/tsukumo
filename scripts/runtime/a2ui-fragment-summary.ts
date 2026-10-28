// 断片（`stream_event`）の列を、種類ごとの数・最初と最後の時刻・字数の合計の表にする。
// 受ける型は字数までで、断片の本文の文字列を持たない。

/** 断片1つの要約。`chars` は `partial_json` か `text` の字数で、無ければ 0。 */
export type FragmentRow = {
  readonly atMs: number
  readonly eventType: string
  readonly deltaType: string
  readonly blockType: string
  readonly chars: number
}

export function summarizeFragments(rows: readonly FragmentRow[]): string {
  const kinds = [...new Set(rows.map(fragmentKind))]
  const lines = kinds.map((kind) => {
    const same = rows.filter((row) => fragmentKind(row) === kind)
    const times = same.map((row) => row.atMs)
    const chars = same.reduce((sum, row) => sum + row.chars, 0)
    return [
      kind.padEnd(44),
      String(same.length).padStart(5),
      String(Math.min(...times)).padStart(8),
      String(Math.max(...times)).padStart(8),
      String(chars).padStart(8),
    ].join(" ")
  })
  const header = [
    "種類".padEnd(42),
    "数".padStart(5),
    "最初ms".padStart(8),
    "最後ms".padStart(8),
    "字数".padStart(8),
  ].join(" ")
  return [header, ...lines].join("\n")
}

/** 表の行の見出しになる種類。`event.type` に、あれば `delta.type`・`content_block.type` を足す。 */
function fragmentKind(row: FragmentRow): string {
  return [row.eventType, row.deltaType, row.blockType].filter((part) => part !== "").join(":")
}
