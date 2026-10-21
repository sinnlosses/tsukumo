// アイテムのコマンドの契約。一覧に足す・消すと、席に置く・空ける。
// どれも駆動には渡らず、書いて `items-changed` を流し直すだけ。

import { z } from "zod"

import { characterPackNameSchema } from "../character-pack/character.ts"
import { commandBase } from "../command.ts"
import {
  MAX_ITEM_DATA_URL_LENGTH,
  parseItemId,
  parseItemImage,
  parseItemName,
  SEAT_KEYS,
} from "../item/item.ts"

/** 一覧の名前。前後の空白を除いて 1〜20 字（除くのは書き込む側が同じ {@link parseItemName} で行う）。 */
const itemNameSchema = z.string().refine((value) => parseItemName(value) !== undefined)

/**
 * 画像1枚の data URL。文字列のまま持ち、ほどくのは書き込む側。
 * 形式と上限は立ち絵と同じ。
 */
const itemImageSchema = z
  .string()
  .max(MAX_ITEM_DATA_URL_LENGTH)
  .refine((value) => parseItemImage(value) !== undefined)

const itemIdSchema = z.string().refine((value) => parseItemId(value) !== undefined)

/** 席を置くパックの名前。一覧にあるかは書き込む側が突き合わせる。 */
const seatPackSchema = characterPackNameSchema

const seatSchema = z.enum(SEAT_KEYS)

export const itemContract = {
  add: commandBase.input(z.object({ name: itemNameSchema, image: itemImageSchema })),
  remove: commandBase.input(z.object({ id: itemIdSchema })),
  setSeat: commandBase.input(
    z.object({ pack: seatPackSchema, seat: seatSchema, id: itemIdSchema }),
  ),
  clearSeat: commandBase.input(z.object({ pack: seatPackSchema, seat: seatSchema })),
}
