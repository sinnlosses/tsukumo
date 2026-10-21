import { type ItemId, parseItemId } from "../../src/shared/item/item.ts"

/** アイテムの id として通る文字列を検査済みの型にする。通らない文字列を渡したテストの書き間違いは throw で落とす。 */
export function itemId(value: string): ItemId {
  const id = parseItemId(value)
  if (id === undefined) {
    throw new Error(`アイテムの id として通らない: ${value}`)
  }
  return id
}
