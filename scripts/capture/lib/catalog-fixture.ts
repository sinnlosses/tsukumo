// カタログの件が置く架空の素材の名前・日付・本文。

/**
 * `HomeSetup` の `character` が置くパックのディレクトリ名。同梱の `chou` とは別名にして、
 * 「ホームにしか無いパック」（`removal: "delete"`）にする。 */
export const SAMPLE_CHARACTER_PACK_NAME = "chou-sample"

/** `HomeSetup` の `diary` が書く日（`diary-written` 場面が書く日付と揃える）。 */
export const DIARY_FIXTURE_DATE = "2026-09-20"

/** `HomeSetup` の `diary` が書く本文。架空の日記で、実物の記録ではない。 */
export const DIARY_FIXTURE_BODY =
  "今日は日記帳の見開きを撮るための架空の日記。実物の作業内容は含まない。" +
  "ダミーの振り返りとして、架空のタスクを1件終えたことにしてある。"
