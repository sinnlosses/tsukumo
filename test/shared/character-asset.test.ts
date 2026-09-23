import { describe, expect, it } from "bun:test"

import {
  characterAssetPath,
  classifyPortraitFile,
  rasterMimeType,
  readCharacterAssetPath,
} from "../../src/shared/character-asset.ts"

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

  it("パックが違えば、同じファイル名でも URL が変わる（版が無くても取り直す）", () => {
    expect(characterAssetPath("pack-a", "default.svg", undefined)).not.toBe(
      characterAssetPath("pack-b", "default.svg", undefined),
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

describe("classifyPortraitFile", () => {
  it("拡張子 .svg は svg として分類する", () => {
    expect(classifyPortraitFile("default.svg")).toBe("svg")
    expect(classifyPortraitFile("DEFAULT.SVG")).toBe("svg")
  })

  it("既知のラスタ拡張子は raster として分類する", () => {
    expect(classifyPortraitFile("default.png")).toBe("raster")
    expect(classifyPortraitFile("default.gif")).toBe("raster")
    expect(classifyPortraitFile("default.jpg")).toBe("raster")
    expect(classifyPortraitFile("default.jpeg")).toBe("raster")
    expect(classifyPortraitFile("default.webp")).toBe("raster")
  })

  it("characterAssetPath が返した URL（?v= 付き）でも拡張子を見失わない", () => {
    expect(classifyPortraitFile(characterAssetPath("tsukumo-spirit", "default.svg", "1"))).toBe(
      "svg",
    )
    expect(classifyPortraitFile(characterAssetPath("local", "default.png", "1"))).toBe("raster")
  })

  it("知らない拡張子・拡張子が無いときは undefined（立ち絵なしにフォールバック）", () => {
    expect(classifyPortraitFile("default.bmp")).toBeUndefined()
    expect(classifyPortraitFile("default")).toBeUndefined()
  })
})

describe("rasterMimeType", () => {
  it("拡張子ごとの MIME タイプを返す", () => {
    expect(rasterMimeType("a.png")).toBe("image/png")
    expect(rasterMimeType("a.jpg")).toBe("image/jpeg")
    expect(rasterMimeType("a.jpeg")).toBe("image/jpeg")
    expect(rasterMimeType("a.gif")).toBe("image/gif")
    expect(rasterMimeType("a.webp")).toBe("image/webp")
  })

  it("svg・未知の拡張子は undefined", () => {
    expect(rasterMimeType("a.svg")).toBeUndefined()
    expect(rasterMimeType("a.bmp")).toBeUndefined()
  })
})
