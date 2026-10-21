import { type DateKey, parseDateKey } from "../../src/shared/achievement/achievement.ts"

/** 実在の `YYYY-MM-DD` を検査済みの型にする。通らない文字列を渡したテストの書き間違いは throw で落とす。 */
export function dateKey(value: string): DateKey {
  const key = parseDateKey(value)
  if (key === undefined) {
    throw new Error(`日付キーとして通らない: ${value}`)
  }
  return key
}
