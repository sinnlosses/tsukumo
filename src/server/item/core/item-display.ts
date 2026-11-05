// 画面へ配る一覧と席を、`items.json` の中身から組む。

import { fromKeys } from "remeda"

import { itemAssetPath } from "../../../shared/item/item-asset.ts"
import { type ItemInfo, type ItemSeatMap, SEAT_KEYS } from "../../../shared/item/item.ts"
import type { ItemsFile } from "./items-file.ts"

export type ShownItems = {
  readonly items: readonly ItemInfo[]
  readonly seats: Readonly<Record<string, ItemSeatMap>>
}

/**
 * 一覧は画像の版が取れたもの（`revisionOf` が undefined でないもの）だけ、席は一覧に載ったアイテムを指すものだけ残し、残りは空とする。
 * `revisionOf` は画像ファイル名から版（`?v=`）を引く。画像が無ければ undefined。
 */
export function shownItems(
  file: ItemsFile,
  revisionOf: (imageFile: string) => string | undefined,
): ShownItems {
  const items = file.items.flatMap((entry): readonly ItemInfo[] => {
    const revision = revisionOf(entry.image)
    return revision === undefined
      ? []
      : [{ id: entry.id, name: entry.name, url: itemAssetPath(entry.image, revision) }]
  })
  const seats = Object.fromEntries(
    Object.entries(file.seats).map(([pack, row]): [string, ItemSeatMap] => [
      pack,
      fromKeys(SEAT_KEYS, (seat) => items.find((item) => item.id === row[seat])),
    ]),
  )
  return { items, seats }
}
