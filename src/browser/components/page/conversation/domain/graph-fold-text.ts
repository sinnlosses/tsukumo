// 折り返し配置の字の幅の見積もりと、見積もりの幅での行の折り方。ブラウザで測らずに座標を決めるための近似。

/** 字の幅の見積もり。全角は字の大きさ、半角はその 0.6 倍。 */
export function textWidth(text: string, fontSize: number): number {
  return [...text].reduce((sum, char) => sum + charWidth(char, fontSize), 0)
}

/** 見積もりの幅で行を折る。半角の語（空白で区切る）は途中で割らない。 */
export function wrapped(text: string, fontSize: number, maxWidth: number): readonly string[] {
  if (text === "") {
    return []
  }
  const lines: string[] = []
  let current = ""
  for (const piece of piecesOf(text)) {
    const next = current + piece
    if (current !== "" && textWidth(next.trimEnd(), fontSize) > maxWidth) {
      lines.push(current.trimEnd())
      current = piece.trimStart()
    } else {
      current = next
    }
  }
  if (current.trim() !== "") {
    lines.push(current.trimEnd())
  }
  return lines
}

/** 折ってよい切れ目で分けた字の並び。全角は1字ずつ、半角は空白の後ろで切る。 */
function piecesOf(text: string): readonly string[] {
  const pieces: string[] = []
  let half = ""
  for (const char of text) {
    if (isFullWidth(char)) {
      if (half !== "") {
        pieces.push(half)
        half = ""
      }
      pieces.push(char)
      continue
    }
    half += char
    if (/\s/u.test(char)) {
      pieces.push(half)
      half = ""
    }
  }
  return half === "" ? pieces : [...pieces, half]
}

function charWidth(char: string, fontSize: number): number {
  return isFullWidth(char) ? fontSize : fontSize * 0.6
}

function isFullWidth(char: string): boolean {
  return (char.codePointAt(0) ?? 0) > 0x2e7f
}
