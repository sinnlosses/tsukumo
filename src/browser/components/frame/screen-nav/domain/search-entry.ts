// 探す（⌘K）の一覧の項目と、打った字での絞り込み。
// 項目は出どころ（画面の登録表・タスクの一覧・コマンドの候補・見た目）ごとに作り、群の順に並べて1本の並びにする。
// 出どころを足すときは、群を `SEARCH_GROUPS` に足し、その群の項目を並びに加える。

/** 群の名前。並びの順がそのまま一覧の群の順。 */
const SEARCH_GROUPS = ["移る", "タスクを頼む", "コマンド", "見た目"] as const

export type SearchGroup = (typeof SEARCH_GROUPS)[number]

export type SearchEntry = {
  /** 一覧の中で重ならない鍵。 */
  readonly key: string
  readonly group: SearchGroup
  readonly label: string
  /** 行の右端に添える語。無ければ空文字。 */
  readonly hint: string
  /** 選んだときにすること。 */
  readonly run: () => void
}

/**
 * 字で絞った項目。空白で区切った語がどれも、名前か添える語に含まれる項目を残す（大文字と小文字は区別しない）。
 * 並びは群の順（{@link SEARCH_GROUPS}）にそろえ、群の中は渡された順のまま。
 */
export function matchingSearchEntries(
  entries: readonly SearchEntry[],
  query: string,
): readonly SearchEntry[] {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "")
  const matched = entries.filter((entry) => {
    const text = `${entry.label} ${entry.hint}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
  return SEARCH_GROUPS.flatMap((group) => matched.filter((entry) => entry.group === group))
}
