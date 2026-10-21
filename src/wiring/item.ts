// アイテムの配線。画面からの4つのコマンドの書き込み先と、起こすたびに流す一覧の中身を選ぶ。
// 席を置けるパックの名前の一覧は `character-pack` の機能が持つので、機能どうしを結ぶこの層で渡す。

import { listCharacterPacks } from "../server/character-pack/adapter/character-pack.ts"
import {
  addItemToHome,
  clearSeatInHome,
  itemsChangedEvent,
  removeItemFromHome,
  setSeatInHome,
} from "../server/item/adapter/item-store.ts"
import type { ItemCommandPorts } from "../server/item/core/item-command.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireItem(context: WiringContext): {
  readonly commands: ItemCommandPorts
  /** 起こすたびに流す、いまの一覧と全パックの席。 */
  readonly itemsEvent: () => SessionEvent
} {
  const knownPacks = (): readonly string[] =>
    listCharacterPacks(context.cwd).map((pack) => pack.name)
  return {
    commands: {
      addItem: (input) => Promise.resolve(addItemToHome(input)),
      removeItem: ({ id }) => Promise.resolve(removeItemFromHome(id)),
      setSeat: (input) => Promise.resolve(setSeatInHome(input, knownPacks())),
      clearSeat: (input) => Promise.resolve(clearSeatInHome(input, knownPacks())),
    },
    itemsEvent: () => itemsChangedEvent(),
  }
}
