import { describe, expect, it } from "vitest"

import { shownItems } from "../../../../src/server/item/core/item-display.ts"
import type { ItemsFile } from "../../../../src/server/item/core/items-file.ts"

const FILE: ItemsFile = {
  items: [
    { id: "1", name: "架空1", image: "1.png" },
    { id: "2", name: "架空2", image: "2.png" },
  ],
  seats: { "fictional-pack": { topLeft: "1", belowLeft: "2", belowRight: "9" } },
}

describe("shownItems", () => {
  it("画像の版が取れたアイテムだけを一覧に残し、席も一覧にある物だけ残す", () => {
    const shown = shownItems(FILE, (imageFile) => (imageFile === "1.png" ? "100" : undefined))
    expect(shown.items.map((item) => item.id)).toEqual(["1"])
    expect(shown.items[0]?.url).toContain("?v=100")
    expect(shown.seats["fictional-pack"]?.topLeft?.id).toBe("1")
    expect(shown.seats["fictional-pack"]?.belowLeft).toBeUndefined()
    expect(shown.seats["fictional-pack"]?.belowRight).toBeUndefined()
  })

  it("全部の画像が無ければ一覧は空で、席の行は残して空にする", () => {
    const shown = shownItems(FILE, () => undefined)
    expect(shown.items).toEqual([])
    expect(Object.keys(shown.seats)).toEqual(["fictional-pack"])
  })
})
