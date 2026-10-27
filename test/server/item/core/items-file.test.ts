import { describe, expect, it } from "vitest"

import {
  type ItemsFile,
  parseItemsFile,
  serializeItemsFile,
} from "../../../../src/server/item/core/items-file.ts"

function item(id: number): { id: string; name: string; image: string } {
  return { id: String(id), name: `架空${id}`, image: `${id}.png` }
}

function text(value: unknown): string {
  return JSON.stringify(value)
}

describe("parseItemsFile", () => {
  it("正常な一覧と席を読む。席が一覧に無い id を指していても読める", () => {
    const reading = parseItemsFile(
      text({ items: [item(1)], seats: { "fictional-pack": { topLeft: "9" } } }),
    )
    expect(reading.kind).toBe("ok")
  })

  it("壊れた JSON・形違いは unreadable", () => {
    expect(parseItemsFile("{").kind).toBe("unreadable")
    expect(parseItemsFile(text({ items: "x", seats: {} })).kind).toBe("unreadable")
    expect(parseItemsFile(text({ items: [] })).kind).toBe("unreadable")
    expect(
      parseItemsFile(text({ items: [{ id: "1", name: "x", image: "../1.png" }], seats: {} })).kind,
    ).toBe("unreadable")
    expect(parseItemsFile(text({ items: [], seats: { "../escape": { topLeft: "1" } } })).kind).toBe(
      "unreadable",
    )
    expect(parseItemsFile(text({ items: [], seats: { pack: { middle: "1" } } })).kind).toBe(
      "unreadable",
    )
  })

  it("30 件は読め、31 件は unreadable", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => item(i + 1))
    expect(parseItemsFile(text({ items: thirty, seats: {} })).kind).toBe("ok")
    expect(parseItemsFile(text({ items: [...thirty, item(31)], seats: {} })).kind).toBe(
      "unreadable",
    )
  })

  it("id の重複は unreadable", () => {
    expect(parseItemsFile(text({ items: [item(1), item(1)], seats: {} })).kind).toBe("unreadable")
  })
})

describe("serializeItemsFile", () => {
  it("書いた文字列を読み戻すと同じ中身になる", () => {
    const file: ItemsFile = { items: [item(1), item(2)], seats: { pack: { belowRight: "2" } } }
    expect(parseItemsFile(serializeItemsFile(file))).toEqual({ kind: "ok", file })
  })
})
