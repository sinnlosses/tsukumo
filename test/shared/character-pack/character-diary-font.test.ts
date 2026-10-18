import { describe, expect, it } from "vitest"

import {
  diaryFontMimeType,
  isDiaryFontFileName,
} from "../../../src/shared/character-pack/character-diary-font.ts"

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
  it.each([
    ["shodo.woff2", "font/woff2"],
    ["shodo.woff", "font/woff"],
    ["shodo.ttf", "font/ttf"],
    ["shodo.otf", "font/otf"],
    ["shodo.eot", undefined],
    ["shodo", undefined],
  ])("%s の MIME タイプは %s", (fileName, expected) => {
    expect(diaryFontMimeType(fileName)).toBe(expected)
  })
})
