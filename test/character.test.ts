import { describe, expect, it } from "bun:test"

import {
  classifyPortraitFile,
  type CharacterDefinition,
  isPlausibleSvgMarkup,
  parseCharacterDefinition,
  rasterMimeType,
  resolveOutfitAccent,
  resolvePortraitFile,
} from "../src/character.ts"

// characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const FULL_DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  portraits: {
    default: "default.svg",
    working: "working.svg",
    proud: "proud.svg",
    flustered: "flustered.svg",
  },
  outfitAccents: {
    default: "#b8c7ff",
    light: "#a8e6c0",
    normal: "#b8c7ff",
    heavy: "#ffb3a7",
  },
})

describe("parseCharacterDefinition", () => {
  it("あるものだけの portraits / outfitAccents をそのまま持つ", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)

    expect(definition?.name).toBe("架空の精霊")
    expect(definition?.portraits.working).toBe("working.svg")
    expect(definition?.outfitAccents.heavy).toBe("#ffb3a7")
  })

  it("見つからない表情・衣装は undefined になる（キー自体は消えない）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg" }, outfitAccents: {} }),
    )

    expect(definition?.portraits.default).toBe("default.svg")
    expect(definition?.portraits.working).toBeUndefined()
    expect(definition?.outfitAccents.default).toBeUndefined()
  })

  it("name が無くても壊れない", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: {}, outfitAccents: {} }),
    )

    expect(definition?.name).toBeUndefined()
  })

  it("JSON として不正なときは undefined", () => {
    expect(parseCharacterDefinition("{this is not valid json")).toBeUndefined()
  })

  it("トップレベルが配列など、オブジェクトでないときは undefined", () => {
    expect(parseCharacterDefinition("[1, 2, 3]")).toBeUndefined()
    expect(parseCharacterDefinition("null")).toBeUndefined()
  })

  it("portraits / outfitAccents が無い・型が違っても、キーはすべて undefined として持つ", () => {
    const definition = parseCharacterDefinition(JSON.stringify({ portraits: "not an object" }))

    expect(definition?.portraits.default).toBeUndefined()
    expect(definition?.outfitAccents.default).toBeUndefined()
  })
})

describe("resolvePortraitFile", () => {
  const definitionWithoutWorking: CharacterDefinition = {
    name: undefined,
    portraits: {
      default: "default.svg",
      working: undefined,
      proud: undefined,
      flustered: undefined,
    },
    outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
  }

  it("該当する表情があればそれを使う", () => {
    expect(resolvePortraitFile(definitionWithoutWorking, "default")).toBe("default.svg")
  })

  it("見つからない表情は default に落ちる", () => {
    expect(resolvePortraitFile(definitionWithoutWorking, "working")).toBe("default.svg")
  })

  it("default も無ければ undefined（立ち絵なしにフォールバック）", () => {
    const empty: CharacterDefinition = {
      name: undefined,
      portraits: { default: undefined, working: undefined, proud: undefined, flustered: undefined },
      outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
    }

    expect(resolvePortraitFile(empty, "working")).toBeUndefined()
  })
})

describe("resolveOutfitAccent", () => {
  it("該当する衣装があればそれを使う", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(definition === undefined ? undefined : resolveOutfitAccent(definition, "heavy")).toBe(
      "#ffb3a7",
    )
  })

  it("見つからない衣装は default に落ちる", () => {
    const definition: CharacterDefinition = {
      name: undefined,
      portraits: { default: undefined, working: undefined, proud: undefined, flustered: undefined },
      outfitAccents: { default: "#b8c7ff", light: undefined, normal: undefined, heavy: undefined },
    }

    expect(resolveOutfitAccent(definition, "light")).toBe("#b8c7ff")
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

describe("isPlausibleSvgMarkup", () => {
  it("<svg ...> で始まる中身は true", () => {
    expect(isPlausibleSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(true)
  })

  it("XML宣言付きの SVG も true", () => {
    expect(isPlausibleSvgMarkup('<?xml version="1.0"?><svg></svg>')).toBe(true)
  })

  it("SVG らしくない中身は false", () => {
    expect(isPlausibleSvgMarkup("not an svg file")).toBe(false)
    expect(isPlausibleSvgMarkup("")).toBe(false)
  })
})
