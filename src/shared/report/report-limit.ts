// `report` の記法の数で決まる規則の上限。

/** `conclusion` の文の数の上限。 */
export const MAX_CONCLUSION_SENTENCES = 2

/** `conclusion` の1文目の長さの上限（全角の字数）。 */
export const MAX_FIRST_SENTENCE = 50

/** `conclusion` の1文目の目安の字数。説明文に出すだけで、検査には使わない。 */
export const FIRST_SENTENCE_TARGET = 30

/** `conclusion` の1文目の読点の数の目安。検査には使わない。 */
export const FIRST_SENTENCE_TARGET_COMMAS = 1

/** 節の `heading` の長さの上限（字数）。 */
export const MAX_HEADING = 30

/** 「名前: 説明」の名前の長さの上限。これより長い頭は文とみなす。 */
export const MAX_ITEM_LABEL = 20

/** `table` の行数の上限。超える分は `rest` に書く。 */
export const MAX_TABLE_ROWS = 10

/** `table` で強調できる行数の上限。 */
export const MAX_EMPHASIS_ROWS = 3

/** `table` の1列のセルの平均の字数がこれ以上なら、その列を文の列とみなす（全角の字数）。 */
export const SENTENCE_CELL_LENGTH = 35

/** `list` の項目数の上限。超える分は最後の項目に「ほか n 件」と書く。 */
export const MAX_LIST_ITEMS = 10

/** `sources` の件数の上限。 */
export const MAX_SOURCES = 10

/** 出典の `title` の長さの上限（字数）。 */
export const MAX_SOURCE_TITLE = 60

/** `terms` の件数の上限。 */
export const MAX_TERMS = 8

/** 用語の `term` の長さの上限（字数）。 */
export const MAX_TERM = 20

/** 用語の `note` の長さの上限（字数）。 */
export const MAX_TERM_NOTE = 80

/** `marks` の無い `code` の行数の上限。 */
export const MAX_PLAIN_CODE_LINES = 45

/** 図派で図の材料とみなす表の行の数。目安で、実証された閾値ではない。 */
export const MIN_FIGURE_TABLE_ROWS = 3

/** 図派で図の材料とみなす番号つきの手順の項目の数。目安。 */
export const MIN_FIGURE_STEPS = 3

/** 図派で図の材料とみなす、1つのセクションの文（`Paragraph`・`Markdown`）の字数の合計。目安。 */
export const MIN_FIGURE_PROSE_CHARS = 400
