import { describe, expect, it } from "vitest"

import { readItemAsset } from "../../../../src/server/item/adapter/item-asset.ts"
import { addItemToHome, itemsChangedEvent } from "../../../../src/server/item/adapter/item-store.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PNG = "data:image/png;base64,iVBORw0KGgo="

describe("readItemAsset", () => {
  const home = useTempDir("item-asset")

  it("一覧に載ったファイルだけ配る", () => {
    addItemToHome({ name: "提灯", image: PNG }, home())
    expect(readItemAsset("1.png", undefined, home())?.contentType).toBe("image/png")
    expect(readItemAsset("../items/1.png", undefined, home())).toBeUndefined()
    expect(readItemAsset("items.json", undefined, home())).toBeUndefined()
    expect(readItemAsset("2.png", undefined, home())).toBeUndefined()
  })

  it("一覧が無いときは何も配らない", () => {
    expect(readItemAsset("1.png", undefined, home())).toBeUndefined()
  })

  it("?v= が今の版と一致したときだけ versioned", () => {
    addItemToHome({ name: "提灯", image: PNG }, home())
    const event = itemsChangedEvent(home())
    const url = event.kind === "items-changed" ? event.items[0]?.url : undefined
    const revision = new URL(url ?? "", "http://x").searchParams.get("v") ?? ""
    expect(readItemAsset("1.png", revision, home())?.versioned).toBe(true)
    expect(readItemAsset("1.png", "0", home())?.versioned).toBe(false)
    expect(readItemAsset("1.png", undefined, home())?.versioned).toBe(false)
  })
})
