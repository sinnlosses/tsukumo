// 「アイテム」の区画のロジック。
// 一覧（全キャラクター共通）と、選んでいるパックの3つの席を畳み、足す・消す・席に置くの呼び先と一緒に返す。
//
// 席はファイルを書くのではなく `item.setSeat` / `item.clearSeat` を送るだけ。変わった姿は `items-changed` で戻ってくる。
// 席に置くのは画面から変えられないパックでも許す（アイテムの置き場は `characters/` の外にあるため）。

import { useState } from "react"

import { MAX_ITEMS, SEAT_KEYS } from "../../../../../../shared/item/item.ts"
import { useSession } from "../../../../../stores/session.ts"
import {
  ITEM_ADD_FULL_TITLE,
  ITEM_ADD_REJECTED_NOTE,
  SEAT_LABEL,
} from "../../domain/character-edit-copy.ts"
import type {
  ItemAddDialogModel,
  ItemRemoveConfirmModel,
  ItemSectionModel,
} from "../../domain/item-edit-model.ts"
import { readFile } from "../../domain/picked-image.ts"
import { useSelectedPack } from "./use-selected-pack.ts"

export function useItemEdit(): ItemSectionModel | undefined {
  const dispatch = useSession((session) => session.dispatch)
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const items = useSession((session) => session.state.items)
  const itemSeats = useSession((session) => session.state.itemSeats)
  const selected = useSelectedPack()
  const [adding, setAdding] = useState<AddState>({ kind: "closed" })
  const [removingId, setRemovingId] = useState<string | undefined>(undefined)

  if (selected.kind === "waiting") {
    return undefined
  }

  const pack = selected.character.pack
  const seatMap = itemSeats[pack]

  const addDialog: ItemAddDialogModel =
    adding.kind === "closed"
      ? { kind: "closed" }
      : {
          kind: "open",
          rejection: adding.rejected
            ? { kind: "shown", text: ITEM_ADD_REJECTED_NOTE }
            : { kind: "none" },
          onSubmit: (name, file) => {
            setAdding({ kind: "open", rejected: false })
            void readFile(file, (image) => {
              dispatchAwaited.item
                .add({ name, image })
                .then(() => {
                  setAdding({ kind: "closed" })
                })
                .catch(() => {
                  setAdding({ kind: "open", rejected: true })
                })
            })
          },
          onClose: () => {
            setAdding({ kind: "closed" })
          },
        }

  const removing = items.find((item) => item.id === removingId)
  const removeConfirm: ItemRemoveConfirmModel =
    removing === undefined
      ? { kind: "closed" }
      : {
          kind: "open",
          name: removing.name,
          url: removing.url,
          emptiedSeats: Object.values(itemSeats)
            .flatMap((seats) => SEAT_KEYS.map((key) => seats[key]))
            .filter((placed) => placed?.id === removing.id).length,
          onConfirm: () => {
            dispatch.item.remove({ id: removing.id })
            setRemovingId(undefined)
          },
          onCancel: () => {
            setRemovingId(undefined)
          },
        }

  const full = items.length >= MAX_ITEMS

  return {
    seats: SEAT_KEYS.map((seat) => ({
      seat,
      label: SEAT_LABEL[seat],
      current: seatMap?.[seat],
      options: items,
      onPick: (id) => {
        if (id === "") {
          dispatch.item.clearSeat({ pack, seat })
        } else {
          dispatch.item.setSeat({ pack, seat, id })
        }
      },
    })),
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      url: item.url,
      onRemove: () => {
        setRemovingId(item.id)
      },
    })),
    add: {
      disabled: full,
      title: full ? ITEM_ADD_FULL_TITLE : undefined,
      onOpen: () => {
        setAdding({ kind: "open", rejected: false })
      },
    },
    addDialog,
    removeConfirm,
  }
}

type AddState = { readonly kind: "closed" } | { readonly kind: "open"; readonly rejected: boolean }
