// 閉じの `**` の直前が約物で、直後が空白でも約物でも行末でもない行を拾う純粋関数。
// CommonMark では、その形の `**` は太字を閉じない。
// 開きと閉じは、段落の中で `**` が出てきた順に対にする（段落は空行・見出し・箇条書きの項・表の行で切る）。
// コードのフェンスの中と inline code の中の `**` は数えない。

const PUNCTUATION = /[\p{P}\p{S}]/u
const WHITESPACE = /\s/u
const FENCE = /^\s*(?:```|~~~)/u
const PARAGRAPH_START = /^\s*(?:$|#|\||[-*+] |\d+[.)] )/u

/** 太字が閉じない行1つ。 */
export type UnclosedBold = {
  /** 行（1始まり）。 */
  readonly line: number
  /** 行の本文。 */
  readonly text: string
}

type Paragraph = { readonly firstLine: number; readonly lines: readonly string[] }

/** 本文から、太字が閉じない行をすべて拾う。 */
export function findUnclosedBold(text: string): UnclosedBold[] {
  return splitParagraphs(text).flatMap(unclosedBoldInParagraph)
}

/** 太字が閉じない行1つを、一覧に出す1行にする。 */
export function formatUnclosedBold(path: string, found: UnclosedBold): string {
  return `${path}:${found.line}: ${found.text.trim()}`
}

function splitParagraphs(text: string): Paragraph[] {
  const paragraphs: { firstLine: number; lines: string[] }[] = []
  let inFence = false
  let current: { firstLine: number; lines: string[] } | undefined
  text.split("\n").forEach((lineText, index) => {
    if (FENCE.test(lineText)) {
      inFence = !inFence
      current = undefined
      return
    }
    if (inFence) return
    if (current === undefined || PARAGRAPH_START.test(lineText)) {
      current = { firstLine: index + 1, lines: [] }
      paragraphs.push(current)
    }
    current.lines.push(lineText)
  })
  return paragraphs
}

function unclosedBoldInParagraph(paragraph: Paragraph): UnclosedBold[] {
  const visible = paragraph.lines
    .join("\n")
    .replace(/(`+)[^`]*?\1/gu, (code) => "`".repeat(code.length))
  const positions = [...visible.matchAll(/\*\*/gu)].map((match) => match.index)
  const lineStarts = paragraph.lines.map((_, index) =>
    paragraph.lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0),
  )
  const badLines = new Set(
    positions
      .filter((position, order) => order % 2 === 1 && closesWrongly(visible, position))
      .map((position) => lineStarts.findLastIndex((start) => start <= position)),
  )
  return [...badLines].map((index) => ({
    line: paragraph.firstLine + index,
    text: paragraph.lines[index] ?? "",
  }))
}

function closesWrongly(visible: string, position: number): boolean {
  const before = Array.from(visible.slice(0, position)).at(-1)
  const after = Array.from(visible.slice(position + 2))[0]
  if (before === undefined || after === undefined) return false
  return (
    PUNCTUATION.test(before) &&
    !WHITESPACE.test(before) &&
    !WHITESPACE.test(after) &&
    !PUNCTUATION.test(after)
  )
}
