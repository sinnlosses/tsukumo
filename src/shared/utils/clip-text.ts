/** 文字列の先頭と、上限を超えて落とした字数（コードポイントの単位。超えていなければ 0）。 */
export type ClippedText = { readonly head: string; readonly omittedLength: number }

export function clipText(text: string, maxLength: number): ClippedText {
  const codePoints = [...text]
  if (codePoints.length <= maxLength) {
    return { head: text, omittedLength: 0 }
  }

  return {
    head: codePoints.slice(0, maxLength).join(""),
    omittedLength: codePoints.length - maxLength,
  }
}
