// 1行の文字列を、バッククォートで囲まれた部分（等幅で出す）とそれ以外に割る。

/** 1片。`code` はバッククォートで囲まれていた部分（囲みの記号は含まない）。 */
export type CodeSpanPart = {
  readonly kind: "text" | "code"
  readonly text: string
}

/** 囲みが閉じていない（バッククォートが奇数個）ときは割らずに字のまま返す。 */
export function codeSpanParts(text: string): readonly CodeSpanPart[] {
  const pieces = text.split("`")
  if (pieces.length % 2 === 0) {
    return [{ kind: "text", text }]
  }
  return pieces
    .map((piece, index): CodeSpanPart => ({ kind: index % 2 === 1 ? "code" : "text", text: piece }))
    .filter((part) => part.text !== "")
}
