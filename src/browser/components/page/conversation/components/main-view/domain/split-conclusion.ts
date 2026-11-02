// 結論の文を、最初の句点までの1文目と、残りの2文目以降に割る。
// バッククォートで囲んだコードの中の句点では割らない。句点が無い・句点より後ろが空のときは全部を1文目にする。

export type ConclusionSplit = {
  readonly first: string
  readonly rest: string
}

export function splitConclusion(text: string): ConclusionSplit {
  const end = firstSentenceEnd(text)
  if (end === undefined || text.slice(end).trim() === "") {
    return { first: text, rest: "" }
  }
  return { first: text.slice(0, end), rest: text.slice(end) }
}

/** 1文目の終わり（最初の句点の次の位置）。 */
function firstSentenceEnd(text: string): number | undefined {
  let inCode = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)
    if (char === "`") {
      inCode = !inCode
    } else if (char === "。" && !inCode) {
      return index + 1
    }
  }
  return undefined
}
