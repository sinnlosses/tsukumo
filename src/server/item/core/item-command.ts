// `item` が受けるコマンドの表と口。一覧に足す・消すと、席に置く・空ける。
// どれも駆動には渡らず、書いて `items-changed` を流し直すだけ。

import type { CommandInputs } from "../../../shared/command.ts"
import type { itemContract } from "../../../shared/contract/item.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { FeatureCommandTable } from "../../core/command-receiver.ts"

type ItemInputs = CommandInputs<typeof itemContract>

export type ItemCommandPorts = {
  /** 一覧の末尾に足し、`items-changed` を返す。受け付けられなかったときは undefined。 */
  readonly addItem: (input: ItemInputs["add"]) => Promise<SessionEvent | undefined>
  /** 一覧から消し、置いていたすべてのパックの席を空けて `items-changed` を返す。 */
  readonly removeItem: (input: ItemInputs["remove"]) => Promise<SessionEvent | undefined>
  readonly setSeat: (input: ItemInputs["setSeat"]) => Promise<SessionEvent | undefined>
  readonly clearSeat: (input: ItemInputs["clearSeat"]) => Promise<SessionEvent | undefined>
}

export function itemCommands(ports: ItemCommandPorts): FeatureCommandTable<typeof itemContract> {
  const failure = FRAME_ERROR_REASON.itemEditFailed
  return {
    add: { kind: "write", receive: ports.addItem, failure },
    remove: { kind: "write", receive: ports.removeItem, failure },
    setSeat: { kind: "write", receive: ports.setSeat, failure },
    clearSeat: { kind: "write", receive: ports.clearSeat, failure },
  }
}
