import { MAX_FIRST_SENTENCE } from "../../../../../../../../../shared/report/report-limit.ts"

/**
 * 頭の欄の最初の塊の1文目が、全角で `MAX_FIRST_SENTENCE` 字を超えるか。
 * 結論は `<div class="conclusion">` のような包みに入っているので、数える前に包みを除く。
 * 1文目は最初の `。！？` の手前まで（末尾の記号は数えない。サーバの数え方と合わせる）。
 */
export function hasLongFirstSentence(firstBlock: string): boolean {
  const text = firstBlock
    .replace(/^\s*<div[^>]*>/, "")
    .replace(/<\/div>\s*$/, "")
    .trim()
  const sentence = text.split(/[。！？]/)[0] ?? ""
  return [...sentence].length > MAX_FIRST_SENTENCE
}
