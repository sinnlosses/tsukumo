import { describe, expect, it } from "bun:test"

import {
  characterAssetCacheKey,
  characterAssetPath,
  classifyPortraitFile,
  rasterMimeType,
} from "../../src/shared/character-asset.ts"

describe("characterAssetPath", () => {
  it("/character/<file> の形にする", () => {
    expect(characterAssetPath("default.svg", undefined)).toBe("/character/default.svg")
  })

  it("取り直しの印があれば問い合わせ文字列 ?v=<印> を付ける", () => {
    expect(characterAssetPath("default.svg", "tsukumo")).toBe("/character/default.svg?v=tsukumo")
  })

  it("印の値はエンコードする（ディレクトリ名に URL の特殊文字が入りうる）", () => {
    expect(characterAssetPath("default.svg", "my pack")).toBe("/character/default.svg?v=my%20pack")
  })
})

describe("characterAssetCacheKey", () => {
  it("パックの名前と素材の版を混ぜる", () => {
    expect(characterAssetCacheKey("tsukumo", "1700000000000")).toBe("tsukumo@1700000000000")
  })

  it("片方だけのときはその値、どちらも無いときは undefined", () => {
    expect(characterAssetCacheKey("tsukumo", undefined)).toBe("tsukumo")
    expect(characterAssetCacheKey(undefined, "42")).toBe("42")
    expect(characterAssetCacheKey(undefined, undefined)).toBeUndefined()
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
    expect(classifyPortraitFile(characterAssetPath("default.svg", "tsukumo-spirit"))).toBe("svg")
    expect(classifyPortraitFile(characterAssetPath("default.png", "local"))).toBe("raster")
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
