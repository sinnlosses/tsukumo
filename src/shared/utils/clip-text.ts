/** 文字列の先頭と、上限を超えて落とした字数（UTF-16 の単位。超えていなければ 0）。 */
export type ClippedText = { readonly head: string; readonly omittedLength: number }

export function clipText(text: string, maxLength: number): ClippedText {
  if (text.length <= maxLength) {
    return { head: text, omittedLength: 0 }
  }

  return { head: text.slice(0, maxLength), omittedLength: text.length - maxLength }
}
