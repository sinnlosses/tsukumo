// `report` の `conclusion` 引数（1要素1文の文字列の配列）を、描く文字列と要素ごとの字数に畳む。

/** 畳んだ `conclusion`。`conclusionSentenceChars` は要素ごとの字数で、文面は持たない。 */
export type ParsedConclusion = {
  readonly conclusion: string
  readonly conclusionSentenceChars: readonly number[]
}

/**
 * `conclusion` の引数を読む。
 * 文字列は1要素とみなす（引数が文字列だったころの transcript）。
 * 欄が無い・空白だけの文字列・空の配列は要素なし。
 * 文字列でも文字列の配列でもなければ undefined。
 */
export function parseConclusion(value: unknown): ParsedConclusion | undefined {
  const sentences = conclusionSentences(value)
  if (sentences === undefined) {
    return undefined
  }
  return {
    conclusion: sentences.join(""),
    conclusionSentenceChars: sentences.map(sentenceChars),
  }
}

function conclusionSentences(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return []
  }
  if (typeof value === "string") {
    return value.trim() === "" ? [] : [value]
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  const strings = value.filter((item: unknown): item is string => typeof item === "string")
  return strings.length === value.length ? strings : undefined
}

/** 要素1つの字数。前後の空白と末尾の `。！？` を除いた全角の字数（code point の数）。 */
function sentenceChars(sentence: string): number {
  return [...sentence.trim().replace(/[。！？]+$/, "")].length
}
