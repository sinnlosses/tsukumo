import { describe, expect, it } from "vitest"

import { FRAME_ERROR_REASON } from "../src/shared/frame.ts"
import { startRouter } from "./fixture/command-router.ts"
import { ITEMS_EVENT } from "./fixture/session-event.ts"

const PNG = "data:image/png;base64,iVBORw0KGgo="

describe("createSocketRouter（item）", () => {
  it("4つのコマンドは口へ届き、items-changed を流し、駆動には渡さない", async () => {
    const { commands, itemCalls, emitted, stub, restarts } = startRouter()

    expect(await commands.item.add({ name: "提灯", image: PNG })).toEqual({ ok: true })
    expect(await commands.item.setSeat({ pack: "fictional-a", seat: "topLeft", id: "1" })).toEqual({
      ok: true,
    })
    expect(await commands.item.clearSeat({ pack: "fictional-a", seat: "topLeft" })).toEqual({
      ok: true,
    })
    expect(await commands.item.remove({ id: "1" })).toEqual({ ok: true })

    expect(itemCalls).toEqual([
      "add:提灯",
      "setSeat:fictional-a:topLeft:1",
      "clearSeat:fictional-a:topLeft",
      "remove:1",
    ])
    expect(emitted).toEqual([ITEMS_EVENT, ITEMS_EVENT, ITEMS_EVENT, ITEMS_EVENT])
    expect(stub.calls).toEqual([])
    expect(restarts).toEqual([])
  })

  it("受け付けられなかったら定型文の理由を返す", async () => {
    const { commands } = startRouter("rejected")
    expect(await commands.item.remove({ id: "1" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.itemEditFailed,
    })
  })

  it("契約が不正な入力を弾き、口は呼ばれない", async () => {
    const { commands, itemCalls } = startRouter()
    const bad = [
      () => commands.item.add({ name: "", image: PNG }),
      () => commands.item.add({ name: "あ".repeat(21), image: PNG }),
      () => commands.item.add({ name: "提灯", image: "data:image/webp;base64,UklGRg==" }),
      () => commands.item.remove({ id: "../1" }),
      () => commands.item.setSeat({ pack: "../escape", seat: "topLeft", id: "1" }),
      () =>
        commands.item.setSeat({
          pack: "fictional-a",
          // @ts-expect-error 知らない席のキーを契約が弾くことを確かめる
          seat: "middle",
          id: "1",
        }),
    ]
    for (const send of bad) {
      await send().then(
        (result) => expect(result).toMatchObject({ ok: false }),
        () => undefined,
      )
    }
    expect(itemCalls).toEqual([])
  })
})
