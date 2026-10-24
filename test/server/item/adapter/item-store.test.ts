import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { tsukumoHomePath } from "../../../../src/server/adapter/tsukumo-home.ts"
import {
  addItemToHome,
  clearSeatInHome,
  itemsChangedEvent,
  itemsFilePath,
  removeItemFromHome,
  setSeatInHome,
} from "../../../../src/server/item/adapter/item-store.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PNG = "data:image/png;base64,iVBORw0KGgo="
const PACKS = ["fictional-a"]

describe("item-store", () => {
  const home = useTempDir("item-store")
  const dir = (): string => tsukumoHomePath("items", home())

  function writeRaw(text: string): void {
    mkdirSync(dir(), { recursive: true })
    writeFileSync(itemsFilePath(dir()), text)
  }

  it("ファイルが無いところへ足すと items.json と画像ができ、配る形に載る", () => {
    const event = addItemToHome({ name: "提灯", image: PNG }, dir())
    expect(existsSync(join(dir(), "1.png"))).toBe(true)
    expect(JSON.parse(readFileSync(itemsFilePath(dir()), "utf8"))).toEqual({
      items: [{ id: "1", name: "提灯", image: "1.png" }],
      seats: {},
    })
    expect(event).toMatchObject({ kind: "items-changed", items: [{ id: "1", name: "提灯" }] })
  })

  it.each([
    ["壊れた JSON", "{"],
    ["形違い", JSON.stringify({ items: "x", seats: {} })],
    [
      "id の重複",
      JSON.stringify({
        items: [
          { id: "1", name: "a", image: "1.png" },
          { id: "1", name: "b", image: "1.png" },
        ],
        seats: {},
      }),
    ],
  ])("%s のときは足す・消す・置く・空けるのすべてを断り、ファイルを変えない", (_label, raw) => {
    writeRaw(raw)
    expect(addItemToHome({ name: "提灯", image: PNG }, dir())).toBeUndefined()
    expect(removeItemFromHome("1", dir())).toBeUndefined()
    expect(
      setSeatInHome({ pack: "fictional-a", seat: "topLeft", id: "1" }, PACKS, dir()),
    ).toBeUndefined()
    expect(clearSeatInHome({ pack: "fictional-a", seat: "topLeft" }, PACKS, dir())).toBeUndefined()
    expect(readFileSync(itemsFilePath(dir()), "utf8")).toBe(raw)
    expect(readdirSync(dir())).toEqual(["items.json"])
    expect(itemsChangedEvent(dir())).toEqual({ kind: "items-changed", items: [], seats: {} })
  })

  it("画像の名前は id から組み、名前に ../ を入れても items/ の外に何も書かれない", () => {
    addItemToHome({ name: "../x", image: PNG }, dir())
    expect(readdirSync(home()).toSorted()).toEqual(["items"])
    expect(readdirSync(dir()).toSorted()).toEqual(["1.png", "items.json"])
  })

  it("別の呼び出しで読み直しても席が残る", () => {
    addItemToHome({ name: "提灯", image: PNG }, dir())
    setSeatInHome({ pack: "fictional-a", seat: "belowRight", id: "1" }, PACKS, dir())
    const event = itemsChangedEvent(dir())
    expect(event).toMatchObject({
      seats: { "fictional-a": { belowRight: { id: "1" }, topLeft: undefined } },
    })
  })

  it("消すと画像が消え、置いていた席が空く", () => {
    addItemToHome({ name: "提灯", image: PNG }, dir())
    setSeatInHome({ pack: "fictional-a", seat: "topLeft", id: "1" }, PACKS, dir())
    const event = removeItemFromHome("1", dir())
    expect(existsSync(join(dir(), "1.png"))).toBe(false)
    expect(event).toEqual({ kind: "items-changed", items: [], seats: {} })
  })

  it("置き換えの途中で書けなくなっても、元の items.json はそのまま残り、一時ファイルも残らない", () => {
    addItemToHome({ name: "提灯", image: PNG }, dir())
    const before = readFileSync(itemsFilePath(dir()), "utf8")

    chmodSync(dir(), 0o500)
    try {
      expect(() =>
        setSeatInHome({ pack: "fictional-a", seat: "topLeft", id: "1" }, PACKS, dir()),
      ).toThrow("EACCES")
    } finally {
      chmodSync(dir(), 0o700)
    }

    expect(readFileSync(itemsFilePath(dir()), "utf8")).toBe(before)
    expect(readdirSync(dir()).filter((name) => name.endsWith(".tmp"))).toEqual([])
  })

  it("画像の無いアイテムと、一覧に無い id を指す席は空として配る", () => {
    writeRaw(
      JSON.stringify({
        items: [{ id: "1", name: "提灯", image: "1.png" }],
        seats: { "fictional-a": { topLeft: "1", belowLeft: "9" } },
      }),
    )
    const event = itemsChangedEvent(dir())
    expect(event).toMatchObject({
      items: [],
      seats: { "fictional-a": { topLeft: undefined, belowLeft: undefined } },
    })
  })
})
