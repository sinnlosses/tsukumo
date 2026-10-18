import { describe, expect, it } from "vitest"

import {
  characterAssetPath,
  portraitImageMimeType,
  readCharacterAssetPath,
} from "../../../src/shared/character-pack/character-asset.ts"

describe("characterAssetPath", () => {
  it("/character/<pack>/<file> の形にする", () => {
    expect(characterAssetPath("tsukumo", "default.svg", undefined)).toBe(
      "/character/tsukumo/default.svg",
    )
  })

  it("素材の版があれば問い合わせ文字列 ?v=<版> を付ける", () => {
    expect(characterAssetPath("tsukumo", "default.svg", "1700000000000")).toBe(
      "/character/tsukumo/default.svg?v=1700000000000",
    )
  })

  it("パック名とファイル名はそれぞれ1つの区間としてエンコードする（区切りがずれない）", () => {
    expect(characterAssetPath("my pack", "sub/立ち絵.png", undefined)).toBe(
      "/character/my%20pack/sub%2F%E7%AB%8B%E3%81%A1%E7%B5%B5.png",
    )
  })
})

describe("readCharacterAssetPath", () => {
  it("characterAssetPath が組んだ経路を、パック名とファイル名に読み戻す", () => {
    const path = characterAssetPath("my pack", "sub/立ち絵.png", undefined)

    expect(readCharacterAssetPath(path.slice("/character/".length))).toEqual({
      pack: "my pack",
      fileName: "sub/立ち絵.png",
    })
  })

  it("区切りが1つでない・どちらかが空のものは読まない", () => {
    expect(readCharacterAssetPath("default.svg")).toBeUndefined()
    expect(readCharacterAssetPath("tsukumo/sub/default.svg")).toBeUndefined()
    expect(readCharacterAssetPath("/default.svg")).toBeUndefined()
    expect(readCharacterAssetPath("tsukumo/")).toBeUndefined()
  })

  it("デコードできない % の並びは読まない", () => {
    expect(readCharacterAssetPath("tsukumo/%E0%A4%A.svg")).toBeUndefined()
  })
})

describe("portraitImageMimeType", () => {
  it.each([
    ["default.svg", "image/svg+xml; charset=utf-8"],
    ["DEFAULT.SVG", "image/svg+xml; charset=utf-8"],
    ["a.png", "image/png"],
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.gif", "image/gif"],
    ["a.webp", "image/webp"],
  ])(
    "%s の MIME タイプは %s（SVG は charset つき・大文字の拡張子も同じ）",
    (fileName, expected) => {
      expect(portraitImageMimeType(fileName)).toBe(expected)
    },
  )

  it("characterAssetPath が返した URL（?v= 付き）でも拡張子を見失わない", () => {
    expect(portraitImageMimeType(characterAssetPath("tsukumo-spirit", "default.svg", "1"))).toBe(
      "image/svg+xml; charset=utf-8",
    )
    expect(portraitImageMimeType(characterAssetPath("local", "default.png", "1"))).toBe("image/png")
  })

  it("知らない拡張子・拡張子が無いときは undefined（立ち絵なしにフォールバック）", () => {
    expect(portraitImageMimeType("default.bmp")).toBeUndefined()
    expect(portraitImageMimeType("default")).toBeUndefined()
  })
})
