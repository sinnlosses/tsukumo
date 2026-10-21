// 読んだ `ItemsFile` に対する4つの編集。入力は書き換えず、新しい値を返す。
// 受け付けないとき（件数の上限・知らない id やパック）は undefined。

import { omit } from "remeda"

import type { PortraitFormat } from "../../../shared/character-pack/portrait-image.ts"
import {
  itemFileName,
  type ItemEntry,
  MAX_ITEMS,
  nextItemId,
  parseItemName,
  type SeatKey,
} from "../../../shared/item/item.ts"
import type { ItemsFile } from "../../../shared/item/items-file.ts"

export type ItemAdded = {
  readonly file: ItemsFile
  /** 書く画像のファイル名（`<id>.<形式>`）。 */
  readonly imageFile: string
}

export type ItemRemoved = {
  readonly file: ItemsFile
  /** 消す画像のファイル名。 */
  readonly removedImage: string
}

/** 一覧の末尾に足す。名前は前後の空白を除いて検査し直す。30 件あれば undefined。 */
export function addItem(
  file: ItemsFile,
  rawName: string,
  format: PortraitFormat,
): ItemAdded | undefined {
  const name = parseItemName(rawName)
  const id = nextItemId(file.items)
  if (name === undefined || id === undefined || file.items.length >= MAX_ITEMS) {
    return undefined
  }
  const imageFile = itemFileName(id, format)
  const entry: ItemEntry = { id, name, image: imageFile }
  return { file: { ...file, items: [...file.items, entry] }, imageFile }
}

/** 一覧から消し、そのアイテムを置いていたすべてのパックの席を空ける。一覧に無い id は undefined。 */
export function removeItem(file: ItemsFile, id: string): ItemRemoved | undefined {
  const removed = file.items.find((item) => item.id === id)
  if (removed === undefined) {
    return undefined
  }
  const seats = Object.fromEntries(
    Object.entries(file.seats).flatMap(([pack, row]) => {
      const kept = Object.fromEntries(Object.entries(row).filter(([, seated]) => seated !== id))
      return Object.keys(kept).length === 0 ? [] : [[pack, kept]]
    }),
  )
  return {
    file: { items: file.items.filter((item) => item.id !== id), seats },
    removedImage: removed.image,
  }
}

/** 席に一覧のアイテムを置く（差し替えを含む）。知らないパック・一覧に無い id は undefined。 */
export function setSeat(
  file: ItemsFile,
  pack: string,
  seat: SeatKey,
  id: string,
  knownPacks: readonly string[],
): ItemsFile | undefined {
  if (!knownPacks.includes(pack) || !file.items.some((item) => item.id === id)) {
    return undefined
  }
  return { ...file, seats: { ...file.seats, [pack]: { ...file.seats[pack], [seat]: id } } }
}

/** 席を空ける。知らないパックは undefined。行が空になったらパックの行ごと落とす。 */
export function clearSeat(
  file: ItemsFile,
  pack: string,
  seat: SeatKey,
  knownPacks: readonly string[],
): ItemsFile | undefined {
  if (!knownPacks.includes(pack)) {
    return undefined
  }
  const row = file.seats[pack]
  if (row === undefined) {
    return file
  }
  const rest = omit(row, [seat])
  return {
    ...file,
    seats:
      Object.keys(rest).length === 0 ? omit(file.seats, [pack]) : { ...file.seats, [pack]: rest },
  }
}
