// `~/.tsukumo/items/items.json`（アイテムの一覧と席の選択）の読み書き。形の正典は `docs/architecture/stage-item.md`「置き場と形」。
// 読めない・形が違うファイルは `unreadable` として分け、書き込みの口はこれを見て断る。

import { z } from "zod"

import { isCharacterPackName } from "../character-pack/character.ts"
import { parseJson } from "../utils/parse-json.ts"
import {
  isItemId,
  isItemImageFileName,
  type ItemEntry,
  MAX_ITEMS,
  parseItemName,
  SEAT_KEYS,
  type SeatKey,
} from "./item.ts"

/** 席の選択。パックの名前 → 席ごとのアイテムの `id`。キーの無い席は空。 */
export type ItemSeatChoices = Readonly<Record<string, Readonly<Partial<Record<SeatKey, string>>>>>

export type ItemsFile = {
  readonly items: readonly ItemEntry[]
  readonly seats: ItemSeatChoices
}

export type ItemsFileReading =
  | { readonly kind: "ok"; readonly file: ItemsFile }
  | { readonly kind: "unreadable" }

export const EMPTY_ITEMS_FILE: ItemsFile = { items: [], seats: {} }

const itemEntrySchema = z.object({
  id: z.string().refine(isItemId),
  name: z.string().refine((value) => parseItemName(value) === value),
  image: z.string().refine(isItemImageFileName),
})

const itemsFileSchema = z
  .object({
    items: z.array(itemEntrySchema).max(MAX_ITEMS),
    seats: z.record(
      z.string().refine(isCharacterPackName),
      z.partialRecord(z.enum(SEAT_KEYS), z.string()),
    ),
  })
  .refine((file) => new Set(file.items.map((item) => item.id)).size === file.items.length)

/** `items.json` の中身を読む。壊れた JSON・形違い・31 件以上・id の重複は `unreadable`。 */
export function parseItemsFile(text: string): ItemsFileReading {
  const parsed = itemsFileSchema.safeParse(parseJson(text))
  return parsed.success ? { kind: "ok", file: parsed.data } : { kind: "unreadable" }
}

/** `items.json` に書く文字列（2 スペースの整形・末尾改行）。 */
export function serializeItemsFile(file: ItemsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}
