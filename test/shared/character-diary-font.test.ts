import { describe, expect, it } from "bun:test"

import { diaryFontMimeType, isDiaryFontFileName } from "../../src/shared/character-diary-font.ts"

describe("isDiaryFontFileName", () => {
  it("受け付けるのは .woff2 / .woff / .ttf / .otf だけ", () => {
    expect(isDiaryFontFileName("shodo.woff2")).toBe(true)
    expect(isDiaryFontFileName("shodo.woff")).toBe(true)
    expect(isDiaryFontFileName("shodo.ttf")).toBe(true)
    expect(isDiaryFontFileName("shodo.otf")).toBe(true)
    expect(isDiaryFontFileName("shodo.OTF")).toBe(true)
    expect(isDiaryFontFileName("shodo.eot")).toBe(false)
    expect(isDiaryFontFileName("shodo.png")).toBe(false)
    expect(isDiaryFontFileName("shodo")).toBe(false)
  })

  it("パスの区切り・空白・引用符が入った名前は通さない（パックの外を指すパスを拒む）", () => {
    expect(isDiaryFontFileName("../shodo.woff2")).toBe(false)
    expect(isDiaryFontFileName("sub/shodo.woff2")).toBe(false)
    expect(isDiaryFontFileName("sho do.woff2")).toBe(false)
    expect(isDiaryFontFileName('sho").woff2')).toBe(false)
    expect(isDiaryFontFileName("")).toBe(false)
  })
})

describe("diaryFontMimeType", () => {
  it("拡張子ごとの MIME タイプを返す", () => {
    expect(diaryFontMimeType("shodo.woff2")).toBe("font/woff2")
    expect(diaryFontMimeType("shodo.woff")).toBe("font/woff")
    expect(diaryFontMimeType("shodo.ttf")).toBe("font/ttf")
    expect(diaryFontMimeType("shodo.otf")).toBe("font/otf")
  })

  it("未知の拡張子は undefined", () => {
    expect(diaryFontMimeType("shodo.eot")).toBeUndefined()
    expect(diaryFontMimeType("shodo")).toBeUndefined()
  })
})
