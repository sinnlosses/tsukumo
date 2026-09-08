// 最新の発話から、吹き出しとして描画する行を決める。「決める」層。
//
// 入力（発話テキストとペイン幅）から出力（枠付きの文字列の配列）への純粋な変換だけを行い、
// 端末への書き込みは行わない（それは src/draw.ts の責務）。

const PLACEHOLDER_UTTERANCE = "（まだ発話がありません）"

// 本文の高さの上限。これを超えたら末尾を残して先頭を省略する（下の「決める」参照）。
const MAX_CONTENT_LINES = 8

const TRUNCATION_MARKER = "…"

// 枠の内側の最小幅。ペインが極端に狭くても崩れないための下限。
const MIN_INNER_WIDTH = 4

/**
 * 発話をペイン幅に合わせて折り返し、枠で囲んだ行の配列にする。
 * 発話がまだ無いときはプレースホルダーを表示する。
 */
export function buildBalloon(utterance: string | undefined, paneWidth: number): readonly string[] {
  const innerWidth = Math.max(paneWidth - 4, MIN_INNER_WIDTH)
  const text = utterance ?? PLACEHOLDER_UTTERANCE
  const wrapped = wrapText(text, innerWidth)
  const content = keepTail(wrapped, MAX_CONTENT_LINES)

  return frame(content, innerWidth)
}

/** テキストを明示的な改行で段落に分け、各段落を表示幅で折り返す。 */
function wrapText(text: string, innerWidth: number): readonly string[] {
  return text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, innerWidth))
}

function wrapParagraph(paragraph: string, innerWidth: number): readonly string[] {
  const characters = Array.from(paragraph)
  if (characters.length === 0) {
    return [""]
  }

  const lines: string[] = []
  let currentLine = ""
  let currentWidth = 0

  for (const character of characters) {
    const width = displayWidth(character)
    if (currentWidth + width > innerWidth && currentLine !== "") {
      lines.push(currentLine)
      currentLine = ""
      currentWidth = 0
    }
    currentLine += character
    currentWidth += width
  }
  lines.push(currentLine)

  return lines
}

// 長い発話は末尾を残す: サイドカーは「今どこまで話しているか」の追従が主目的なので、
// 途中で切るなら会話の続き（末尾）を優先して見せる。先頭を省略記号で示す。
function keepTail(lines: readonly string[], maxLines: number): readonly string[] {
  if (lines.length <= maxLines) {
    return lines
  }

  return [TRUNCATION_MARKER, ...lines.slice(lines.length - (maxLines - 1))]
}

// 角丸で囲む。立ち絵は角ばった枠（┌┐└┘）で囲むので、両方が同じ形だと額縁と吹き出しの
// 区別がつかなくなる。この描き分けは検討時のスケッチから引き継いでいる。
function frame(content: readonly string[], innerWidth: number): readonly string[] {
  const horizontal = "─".repeat(innerWidth + 2)
  const top = `╭${horizontal}╮`
  const bottom = `╰${horizontal}╯`
  const body = content.map((line) => `│ ${padToWidth(line, innerWidth)} │`)

  return [top, ...body, bottom]
}

function padToWidth(line: string, targetWidth: number): string {
  const gap = targetWidth - displayWidth(line)
  return gap > 0 ? line + " ".repeat(gap) : line
}

function displayWidth(text: string): number {
  return Array.from(text).reduce((total, character) => total + charWidth(character), 0)
}

// 全角文字を半角の2倍として数える簡易版。厳密な East Asian Width 判定ではなく、
// 実用上よく出る範囲（ひらがな・カタカナ・CJK統合漢字・全角英数記号など）だけをカバーする。
function charWidth(character: string): number {
  const codePoint = character.codePointAt(0)
  if (codePoint === undefined) {
    return 1
  }

  const isWide =
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)

  return isWide ? 2 : 1
}
