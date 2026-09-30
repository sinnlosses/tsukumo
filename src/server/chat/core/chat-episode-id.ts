// エピソードの `id`（`to` のローカル日付＋その日の通し番号）の読み方。

/**
 * 日付ごとの、次に振る通し番号の元になるカウンタ。
 * 既にある行の続きから振るので、1回の定着で複数のエピソードが同じ日に落ちても重ならない。
 */
export function episodeIdCounters(
  existing: readonly { readonly id: string }[],
): Map<string, number> {
  const counters = new Map<string, number>()
  for (const record of existing) {
    const parsed = parseEpisodeId(record.id)
    if (parsed === undefined) {
      continue
    }
    counters.set(parsed.dateKey, Math.max(counters.get(parsed.dateKey) ?? 0, parsed.number))
  }
  return counters
}

const EPISODE_ID_PATTERN = /^(\d{4}-\d{2}-\d{2})-(\d+)$/

/** 既存の `id` を日付と通し番号に割る（形が合わない `id` は undefined）。 */
function parseEpisodeId(
  id: string,
): { readonly dateKey: string; readonly number: number } | undefined {
  const match = EPISODE_ID_PATTERN.exec(id)
  if (match === null) {
    return undefined
  }
  const dateKey = match[1]
  const numberText = match[2]
  if (dateKey === undefined || numberText === undefined) {
    return undefined
  }
  return { dateKey, number: Number(numberText) }
}
