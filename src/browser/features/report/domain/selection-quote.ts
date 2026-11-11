// 選んだ字を、入力欄へ入れる引用（各行の頭に `> `）に整える。

/** 引用に入れる字の上限。 */
const QUOTE_MAX_CHARS = 300

const ELLIPSIS = "…"

/**
 * 選んだ字の前後の空白（段落を選ぶと付く末尾の改行など）を落とし、`QUOTE_MAX_CHARS` 字で切り（切ったら末尾に …）、各行の頭に `> ` を付ける。
 * 空の選択は空文字。
 */
export function quoteOf(selected: string): string {
  const trimmed = selected.trim()
  if (trimmed === "") {
    return ""
  }
  const chars = Array.from(trimmed)
  const cut =
    chars.length > QUOTE_MAX_CHARS
      ? `${chars.slice(0, QUOTE_MAX_CHARS).join("")}${ELLIPSIS}`
      : trimmed
  return cut
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}
