// 本文が「読めるものを1字も持たない」か。
// `String.prototype.trim()` では足りない。
// ゼロ幅スペース（U+200B）・BOM（U+FEFF）・ゼロ幅接合子のような書式文字（Unicode の `Cf`）は空白に数えられず残るので、それだけの本文が空の箱として締めの本文に選ばれ、その前の本物のレポートが画面から消える。

const BLANK_TEXT = /^[\p{White_Space}\p{Cf}]*$/u

export function isBlankText(text: string): boolean {
  return BLANK_TEXT.test(text)
}
