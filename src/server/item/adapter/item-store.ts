// アイテムの一覧と席の選択（`<ホーム>/items/items.json`）と、素材の画像の読み書き。
// 形と上限の正典は `docs/architecture/stage-item.md`。
//
// 書き込みの口は、`items.json` が読めない（壊れている・形が違う）ときはすべて断る（undefined を返す）。
// 壊れたファイルを読めた分で上書きすると、一覧が黙って消えるため。ファイルが無いのは「まだ何も足していない」で、最初に足したときに作る。

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { fromKeys } from "remeda"

import { itemAssetPath } from "../../../shared/item/item-asset.ts"
import {
  type ItemInfo,
  type ItemSeatMap,
  parseItemImage,
  SEAT_KEYS,
  type SeatKey,
} from "../../../shared/item/item.ts"
import {
  EMPTY_ITEMS_FILE,
  type ItemsFile,
  type ItemsFileReading,
  parseItemsFile,
  serializeItemsFile,
} from "../../../shared/item/items-file.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import { addItem, clearSeat, removeItem, setSeat } from "../core/item-edit.ts"

const ITEMS_DIR_NAME = "items"
const ITEMS_FILE_NAME = "items.json"

export type ItemsFileState = { readonly kind: "absent" } | ItemsFileReading

export function itemsDir(home: string): string {
  return join(home, ITEMS_DIR_NAME)
}

export function itemsFilePath(home: string): string {
  return join(itemsDir(home), ITEMS_FILE_NAME)
}

/** `items.json` を読む。無い（ENOENT）だけが `absent`、それ以外の読み失敗と形違いは `unreadable`。 */
export function readItemsFile(home: string = tsukumoHomeDir()): ItemsFileState {
  let text: string
  try {
    text = readFileSync(itemsFilePath(home), "utf8")
  } catch (error) {
    return isMissing(error) ? { kind: "absent" } : { kind: "unreadable" }
  }
  return parseItemsFile(text)
}

export type AddItemInput = { readonly name: string; readonly image: string }

/** 一覧の末尾に足す。読めない・30 件ある・入力が不正なときは undefined。 */
export function addItemToHome(
  input: AddItemInput,
  home: string = tsukumoHomeDir(),
): SessionEvent | undefined {
  const file = writableItemsFile(home)
  const image = parseItemImage(input.image)
  if (file === undefined || image === undefined) {
    return undefined
  }
  const added = addItem(file, input.name, image.format)
  if (added === undefined) {
    return undefined
  }
  mkdirSync(itemsDir(home), { recursive: true })
  writeFileSync(join(itemsDir(home), added.imageFile), Buffer.from(image.base64, "base64"))
  writeItemsFile(home, added.file)
  return itemsChangedEvent(home)
}

/** 一覧から消し、置いていたすべてのパックの席を空ける。`items.json` を先に書き、そのあと画像を消す。 */
export function removeItemFromHome(
  id: string,
  home: string = tsukumoHomeDir(),
): SessionEvent | undefined {
  const file = writableItemsFile(home)
  const removed = file === undefined ? undefined : removeItem(file, id)
  if (removed === undefined) {
    return undefined
  }
  writeItemsFile(home, removed.file)
  rmSync(join(itemsDir(home), removed.removedImage), { force: true })
  return itemsChangedEvent(home)
}

export function setSeatInHome(
  input: { readonly pack: string; readonly seat: SeatKey; readonly id: string },
  knownPacks: readonly string[],
  home: string = tsukumoHomeDir(),
): SessionEvent | undefined {
  const file = writableItemsFile(home)
  const edited =
    file === undefined ? undefined : setSeat(file, input.pack, input.seat, input.id, knownPacks)
  if (edited === undefined) {
    return undefined
  }
  writeItemsFile(home, edited)
  return itemsChangedEvent(home)
}

export function clearSeatInHome(
  input: { readonly pack: string; readonly seat: SeatKey },
  knownPacks: readonly string[],
  home: string = tsukumoHomeDir(),
): SessionEvent | undefined {
  const file = writableItemsFile(home)
  const edited =
    file === undefined ? undefined : clearSeat(file, input.pack, input.seat, knownPacks)
  if (edited === undefined) {
    return undefined
  }
  writeItemsFile(home, edited)
  return itemsChangedEvent(home)
}

/**
 * 画面へ配る一覧と全パックの席。
 * 一覧は画像がディスクにあるものだけ、席は一覧に載って画像のあるアイテムを指すものだけ残し、残りは空として配る。
 * ファイルが無い・読めないときは空の一覧。
 */
export function itemsChangedEvent(home: string = tsukumoHomeDir()): SessionEvent {
  const state = readItemsFile(home)
  if (state.kind !== "ok") {
    return { kind: "items-changed", items: [], seats: {} }
  }
  const shown = state.file.items.flatMap((entry): readonly ItemInfo[] => {
    const revision = itemImageRevision(home, entry.image)
    return revision === undefined
      ? []
      : [{ id: entry.id, name: entry.name, url: itemAssetPath(entry.image, revision) }]
  })
  const seats = Object.fromEntries(
    Object.entries(state.file.seats).map(([pack, row]): [string, ItemSeatMap] => [
      pack,
      fromKeys(SEAT_KEYS, (seat) => shown.find((item) => item.id === row[seat])),
    ]),
  )
  return { kind: "items-changed", items: shown, seats }
}

/**
 * 画像の版（`?v=`）。`items.json` と画像の更新時刻の大きいほうをミリ秒で。
 * 画像がディスクに無いときは undefined。
 */
export function itemImageRevision(home: string, imageFile: string): string | undefined {
  try {
    const image = statSync(join(itemsDir(home), imageFile)).mtimeMs
    const list = statSync(itemsFilePath(home)).mtimeMs
    return String(Math.floor(Math.max(image, list)))
  } catch {
    return undefined
  }
}

/** 書き込みの土台にする `items.json`。無ければ空、読めなければ undefined（書き込みを断る）。 */
function writableItemsFile(home: string): ItemsFile | undefined {
  const state = readItemsFile(home)
  switch (state.kind) {
    case "absent":
      return EMPTY_ITEMS_FILE
    case "ok":
      return state.file
    case "unreadable":
      return undefined
  }
}

/** 同じディレクトリの一時ファイルから置き換え、途中で落ちても半端な `items.json` を残さない。 */
function writeItemsFile(home: string, file: ItemsFile): void {
  const dir = itemsDir(home)
  const temporary = join(dir, `.${ITEMS_FILE_NAME}.${process.pid}.tmp`)
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(temporary, serializeItemsFile(file))
    renameSync(temporary, itemsFilePath(home))
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
