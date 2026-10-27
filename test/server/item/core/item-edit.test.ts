import { describe, expect, it } from "vitest"

import {
  addItem,
  clearSeat,
  removeItem,
  setSeat,
} from "../../../../src/server/item/core/item-edit.ts"
import type { ItemsFile } from "../../../../src/server/item/core/items-file.ts"

const PACKS = ["fictional-a", "fictional-b"]

function file(count: number): ItemsFile {
  return {
    items: Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      name: `架空${i + 1}`,
      image: `${i + 1}.png`,
    })),
    seats: {},
  }
}

describe("addItem", () => {
  it("id は最大＋1、画像名は id から組み、名前の前後の空白は除く", () => {
    const added = addItem({ ...file(3), items: file(3).items.slice(1) }, "  提灯 ", "svg")
    expect(added?.imageFile).toBe("4.svg")
    expect(added?.file.items.at(-1)).toEqual({ id: "4", name: "提灯", image: "4.svg" })
  })

  it("30 件目は通り、31 件目は断る", () => {
    expect(addItem(file(29), "架空", "png")?.file.items).toHaveLength(30)
    expect(addItem(file(30), "架空", "png")).toBeUndefined()
  })

  it("不正な名前は断り、入力を書き換えない", () => {
    const before = file(1)
    expect(addItem(before, "   ", "png")).toBeUndefined()
    addItem(before, "架空", "png")
    expect(before.items).toHaveLength(1)
  })
})

describe("removeItem", () => {
  it("置いていたすべてのパックの席を空け、他の席は残す", () => {
    const base: ItemsFile = {
      ...file(2),
      seats: {
        "fictional-a": { topLeft: "1", belowLeft: "2" },
        "fictional-b": { belowRight: "1" },
      },
    }
    const removed = removeItem(base, "1")
    expect(removed?.removedImage).toBe("1.png")
    expect(removed?.file.items.map((item) => item.id)).toEqual(["2"])
    expect(removed?.file.seats).toEqual({ "fictional-a": { belowLeft: "2" } })
  })

  it("一覧に無い id は断る", () => {
    expect(removeItem(file(1), "9")).toBeUndefined()
  })
})

describe("setSeat / clearSeat", () => {
  it("置く・差し替える・空ける", () => {
    const placed = setSeat(file(2), "fictional-a", "topLeft", "1", PACKS)
    expect(placed?.seats).toEqual({ "fictional-a": { topLeft: "1" } })
    const swapped = placed && setSeat(placed, "fictional-a", "topLeft", "2", PACKS)
    expect(swapped?.seats).toEqual({ "fictional-a": { topLeft: "2" } })
    const cleared = swapped && clearSeat(swapped, "fictional-a", "topLeft", PACKS)
    expect(cleared?.seats).toEqual({})
  })

  it("知らないパックと一覧に無い id は断る", () => {
    expect(setSeat(file(1), "unknown", "topLeft", "1", PACKS)).toBeUndefined()
    expect(setSeat(file(1), "fictional-a", "topLeft", "9", PACKS)).toBeUndefined()
    expect(clearSeat(file(1), "unknown", "topLeft", PACKS)).toBeUndefined()
  })

  it("入力を書き換えない", () => {
    const base = file(1)
    setSeat(base, "fictional-a", "topLeft", "1", PACKS)
    expect(base.seats).toEqual({})
  })
})
