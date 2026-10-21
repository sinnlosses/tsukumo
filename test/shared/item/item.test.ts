import { describe, expect, it } from "vitest"

import {
  isItemId,
  itemFileName,
  type ItemEntry,
  nextItemId,
  parseItemImage,
  parseItemName,
} from "../../../src/shared/item/item.ts"

const PNG = "data:image/png;base64,iVBORw0KGgo="

function entry(id: string): ItemEntry {
  return { id, name: "架空", image: `${id}.png` }
}

describe("parseItemName", () => {
  it("前後の空白を除いて 1〜20 字を通す", () => {
    expect(parseItemName("  提灯 ")).toBe("提灯")
    expect(parseItemName("あ".repeat(20))).toBe("あ".repeat(20))
  })

  it("空・空白だけ・21 字は断る", () => {
    expect(parseItemName("")).toBeUndefined()
    expect(parseItemName("   ")).toBeUndefined()
    expect(parseItemName("あ".repeat(21))).toBeUndefined()
  })
})

describe("parseItemImage", () => {
  it("svg・png・gif は通り、webp は断る", () => {
    expect(parseItemImage(PNG)?.format).toBe("png")
    expect(parseItemImage("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")?.format).toBe("svg")
    expect(parseItemImage("data:image/gif;base64,R0lGODlhAQABAAAAACw=")?.format).toBe("gif")
    expect(parseItemImage("data:image/webp;base64,UklGRg==")).toBeUndefined()
  })

  it("デコード後 2 MiB を超えると断る", () => {
    const big = `data:image/png;base64,${"A".repeat(Math.ceil((2 * 1024 * 1024 + 10) / 3) * 4)}`
    expect(parseItemImage(big)).toBeUndefined()
  })
})

describe("nextItemId", () => {
  it("空なら 1、欠番があっても最大＋1", () => {
    expect(nextItemId([])).toBe("1")
    expect(nextItemId([entry("1"), entry("5"), entry("3")])).toBe("6")
  })
})

describe("識別子の門", () => {
  it("id は10進の数字列だけを通す", () => {
    expect(isItemId("12")).toBe(true)
    expect(isItemId("../1")).toBe(false)
    expect(isItemId("0")).toBe(false)
    expect(isItemId("")).toBe(false)
  })

  it("画像のファイル名を組む", () => {
    expect(itemFileName("3", "svg")).toBe("3.svg")
  })
})
