import { describe, expect, it } from "vitest"

import { itemAssetPath, readItemAssetPath } from "../../../src/server/core/item-asset.ts"

describe("itemAssetPath / readItemAssetPath", () => {
  it("版つきの URL からファイル名を読み戻せる", () => {
    const url = itemAssetPath("1.png", "123")
    expect(url).toBe("/item/1.png?v=123")
    expect(readItemAssetPath(url.slice("/item/".length).split("?")[0] ?? "")).toBe("1.png")
  })

  it("版が無ければ問い合わせ文字列を付けない", () => {
    expect(itemAssetPath("1.png", undefined)).toBe("/item/1.png")
  })

  it("区切りを含む名前は1区間にエンコードされ、読み戻すと元の名前に戻る", () => {
    const path = itemAssetPath("a b/c.png", undefined).slice("/item/".length)
    expect(path.includes("/")).toBe(false)
    expect(readItemAssetPath(path)).toBe("a b/c.png")
  })

  it("空・区切りを含む・壊れた % は読めない", () => {
    expect(readItemAssetPath("")).toBeUndefined()
    expect(readItemAssetPath("a/b.png")).toBeUndefined()
    expect(readItemAssetPath("%E0%A4%A")).toBeUndefined()
  })
})
