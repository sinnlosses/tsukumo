// キャラビューの席に置くアイテムの語彙。席のキー・名前と画像の検査・id とファイル名の組み方・画面へ配る形。
// 置き場と上限の正典は `docs/architecture/stage-item.md`。

import {
  MAX_PORTRAIT_DATA_URL_LENGTH,
  parsePortraitImage,
  type PortraitFormat,
  type PortraitImage,
} from "../character-pack/portrait-image.ts"

/** 席のキー。左上・キャラの左下・キャラの右下の3つ。 */
export const SEAT_KEYS = ["topLeft", "belowLeft", "belowRight"] as const

export type SeatKey = (typeof SEAT_KEYS)[number]

/** 一覧に置けるアイテムの件数の上限。 */
export const MAX_ITEMS = 30

export const MAX_ITEM_NAME_LENGTH = 20

/** 画像の data URL の文字列の上限。立ち絵と同じ。 */
export const MAX_ITEM_DATA_URL_LENGTH = MAX_PORTRAIT_DATA_URL_LENGTH

/** 一覧の1件（`items.json` の `items` の要素）。`image` は `items/` の下のファイル名。 */
export type ItemEntry = {
  readonly id: string
  readonly name: string
  readonly image: string
}

/** 画面へ配る1件。`url` は `/item/<file>?v=<版>`。 */
export type ItemInfo = {
  readonly id: string
  readonly name: string
  readonly url: string
}

/** 1つのパックの席。空の席は undefined。 */
export type ItemSeatMap = Readonly<Record<SeatKey, ItemInfo | undefined>>

/** 名前を前後の空白を除いて 1〜20 字で受ける。満たさないときは undefined。 */
export function parseItemName(value: string): string | undefined {
  const name = value.trim()
  const length = [...name].length
  return length >= 1 && length <= MAX_ITEM_NAME_LENGTH ? name : undefined
}

/** 画像の data URL を読む。形式と上限は立ち絵と同じ。 */
export function parseItemImage(dataUrl: string): PortraitImage | undefined {
  return parsePortraitImage(dataUrl)
}

/** サーバが振る id（10進の数字列）として検査したもの。作れるのは {@link parseItemId} だけ。 */
export type ItemId = string & { readonly __brand: "ItemId" }

/** サーバが振る id（10進の数字列）の形なら検査済みの型にして返す。受け取った文字列をパスにしないための門。 */
export function parseItemId(value: string): ItemId | undefined {
  return hasItemIdShape(value) ? value : undefined
}

/** 画像のファイル名として読んでよい形（`<id>.<svg|png|gif>`）か。 */
export function isItemImageFileName(value: string): boolean {
  return ITEM_IMAGE_FILE_PATTERN.test(value)
}

/** 画像のファイル名。名前ではなく id から組む。 */
export function itemFileName(id: ItemId, format: PortraitFormat): string {
  return `${id}.${format}`
}

/** いまある id の最大＋1 の10進。空なら `"1"`。桁の上限を超えるときは undefined。 */
export function nextItemId(items: readonly ItemEntry[]): ItemId | undefined {
  const largest = items.reduce((max, item) => Math.max(max, Number(item.id)), 0)
  return parseItemId(String(largest + 1))
}

function hasItemIdShape(value: string): value is ItemId {
  return ITEM_ID_PATTERN.test(value)
}

const ITEM_ID_PATTERN = /^[1-9][0-9]{0,8}$/
const ITEM_IMAGE_FILE_PATTERN = /^[1-9][0-9]{0,8}\.(svg|png|gif)$/
