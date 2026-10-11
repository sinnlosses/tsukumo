// `report` の記法の数で決まる規則の上限。

/** `options` の候補、`compare` / `beforeAfter` の側の箇条、`image` の `notes` の数の上限。 */
export const MAX_CANDIDATES = 5

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
