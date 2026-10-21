// キャラクター画面の「アイテム」の区画が画面に出す形。フックが畳み、部品が置くだけ。

import type { ItemInfo, SeatKey } from "../../../../../shared/item/item.ts"

/** 席1つの札。`current` が空ならその席には何も置いていない。 */
export type SeatPickModel = {
  readonly seat: SeatKey
  /** 札の字（「左上」「キャラの左下」「キャラの右下」）。 */
  readonly label: string
  readonly current: ItemInfo | undefined
  /** 選び口の選択肢（一覧）。先頭の「置かない」は部品が足す。 */
  readonly options: readonly ItemInfo[]
  /** 空文字は「置かない」。 */
  readonly onPick: (id: string) => void
}

/** 一覧の格子の1件。 */
export type ItemCardModel = {
  readonly id: string
  readonly name: string
  readonly url: string
  /** 押すと消す前の確かめを開く。 */
  readonly onRemove: () => void
}

export type ItemAddDialogModel =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      /** 断られた直後の一言。次に送り直すと消える。 */
      readonly rejection:
        | { readonly kind: "none" }
        | { readonly kind: "shown"; readonly text: string }
      /** 名前と選んだ画像を送る。受け付けられたら閉じ、断られたら `rejection` を出す。 */
      readonly onSubmit: (name: string, file: File) => void
      readonly onClose: () => void
    }

export type ItemRemoveConfirmModel =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly name: string
      readonly url: string
      /** 消すと空になる席の数（全パックの席を数える）。 */
      readonly emptiedSeats: number
      readonly onConfirm: () => void
      readonly onCancel: () => void
    }

export type ItemSectionModel = {
  readonly seats: readonly SeatPickModel[]
  readonly items: readonly ItemCardModel[]
  readonly add: {
    readonly disabled: boolean
    /** 押せない理由。 */
    readonly title: string | undefined
    readonly onOpen: () => void
  }
  readonly addDialog: ItemAddDialogModel
  readonly removeConfirm: ItemRemoveConfirmModel
}
