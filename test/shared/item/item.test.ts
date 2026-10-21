import { describe, expect, it } from "vitest"

import {
  itemFileName,
  type ItemEntry,
  nextItemId,
  parseItemId,
  parseItemImage,
  parseItemName,
} from "../../../src/shared/item/item.ts"
import { itemId } from "../../fixture/item-id.ts"

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

  it("桁の上限を超えるときは undefined", () => {
    expect(nextItemId([entry("999999999")])).toBeUndefined()
  })
})

describe("識別子の門", () => {
  it("id は10進の数字列だけを通す", () => {
    expect(parseItemId("12")).toBe("12")
    expect(parseItemId("../1")).toBeUndefined()
    expect(parseItemId("0")).toBeUndefined()
    expect(parseItemId("")).toBeUndefined()
  })

  it("画像のファイル名を組む", () => {
    expect(itemFileName(itemId("3"), "svg")).toBe("3.svg")
  })

  it("検査していない文字列では画像のファイル名を組めない（型検査が落とす）", () => {
    // @ts-expect-error 検査していない string は ItemId ではない
    expect(itemFileName("../x", "png")).toBe("../x.png")
  })
})
