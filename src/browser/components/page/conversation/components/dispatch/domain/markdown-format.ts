// 書式のボタンが選択範囲へ加える変更。
// 位置は CodeMirror と同じ UTF-16 の添字で、`text` の中の位置をそのまま返す。

export type MarkdownFormat =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "link"
  | "bullet"
  | "quote"

/** 選択範囲（`from <= to`）と、それを含む文面。 */
export type FormatTarget = {
  readonly text: string
  readonly from: number
  readonly to: number
}

/** `from`〜`to` を `insert` へ置き換え、そのあとの選択を `anchor`〜`head` にする。 */
export type FormatEdit = {
  readonly from: number
  readonly to: number
  readonly insert: string
  readonly anchor: number
  readonly head: number
}

export function formatEdit(target: FormatTarget, format: MarkdownFormat): FormatEdit {
  switch (format) {
    case "link":
      return linkEdit(target)
    case "bullet":
    case "quote":
      return linePrefixEdit(target, LINE_MARK[format])
    case "bold":
    case "italic":
    case "strikethrough":
    case "code":
      return wrapEdit(target, WRAP_MARK[format])
  }
}

/** 範囲ありのリンクで、宛先の場所に入れて選択しておく仮の字。 */
const LINK_URL_SAMPLE = "url"

const WRAP_MARK = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  code: "`",
} as const satisfies Partial<Record<MarkdownFormat, string>>

const LINE_MARK = {
  bullet: "- ",
  quote: "> ",
} as const satisfies Partial<Record<MarkdownFormat, string>>

function wrapEdit({ text, from, to }: FormatTarget, mark: string): FormatEdit {
  const selected = text.slice(from, to)
  const anchor = from + mark.length
  return { from, to, insert: `${mark}${selected}${mark}`, anchor, head: anchor + selected.length }
}

function linkEdit({ text, from, to }: FormatTarget): FormatEdit {
  if (from === to) {
    return { from, to, insert: "[]()", anchor: from + 1, head: from + 1 }
  }
  const selected = text.slice(from, to)
  const anchor = from + selected.length + 3
  return {
    from,
    to,
    insert: `[${selected}](${LINK_URL_SAMPLE})`,
    anchor,
    head: anchor + LINK_URL_SAMPLE.length,
  }
}

/** 選択にかかる行の頭へ記号を付ける。選択が次の行の頭で終わるときは、その行を含めない。 */
function linePrefixEdit({ text, from, to }: FormatTarget, mark: string): FormatEdit {
  const lineStart = text.slice(0, from).lastIndexOf("\n") + 1
  const end = to > from && text[to - 1] === "\n" ? to - 1 : to
  const nextBreak = text.indexOf("\n", end)
  const lineEnd = nextBreak === -1 ? text.length : nextBreak
  const lines = text.slice(lineStart, lineEnd).split("\n")
  return {
    from: lineStart,
    to: lineEnd,
    insert: lines.map((line) => `${mark}${line}`).join("\n"),
    anchor: from + mark.length,
    head: to + mark.length * lines.length,
  }
}
