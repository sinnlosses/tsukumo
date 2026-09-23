// 本文の地の文が日本語か。**締めの本文が英語の書き直しだったとき、手前の日本語のレポートへ
// 最終レポートの席を戻す**判定に使う（`src/shared/main-view.ts` の `promotedReportId`。
// `docs/requirements.md` 4.2）。
//
// 数えるのは地の文だけ。コード（フェンス・インライン）・HTML のタグ・URL は、日本語の
// レポートでも英字だらけなので先に落とす。**迷ったら日本語の側に倒す**——外すと、日本語で
// 書いた締めの本文が手前の本文に席を奪われる。

const CODE_FENCE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gmu
const INLINE_CODE = /`[^`\n]*`/gu
const HTML_TAG = /<[^>\n]*>/gu
const WEB_ADDRESS = /https?:\/\/\S+/gu
const JAPANESE_LETTER = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu
const LATIN_LETTER = /\p{Script=Latin}/gu

/**
 * 日本語の1字に対して英字を何字まで許すか。日本語の地の文に混ざる英字（`bun run check`
 * のような識別子を囲み忘れたもの・pass / fail など）は、1字あたりの情報量が小さいぶん
 * 数が膨らむので、広めに取る。英語の本文が持つ日本語の字は、引用した数語ぶんしかない。
 */
const LATIN_PER_JAPANESE_LETTER = 4

export function isJapaneseProse(markdown: string): boolean {
  const prose = markdown
    .replace(CODE_FENCE, "")
    .replace(INLINE_CODE, "")
    .replace(HTML_TAG, "")
    .replace(WEB_ADDRESS, "")
  const japanese = prose.match(JAPANESE_LETTER)?.length ?? 0
  const latin = prose.match(LATIN_LETTER)?.length ?? 0
  return latin <= japanese * LATIN_PER_JAPANESE_LETTER
}
