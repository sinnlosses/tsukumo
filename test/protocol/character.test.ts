import { describe, expect, it } from "bun:test"

import {
  availableExpressions,
  characterAssetPath,
  classifyPortraitFile,
  type CharacterDefinition,
  parseCharacterDefinition,
  rasterMimeType,
  resolveOutfitAccent,
  resolvePortraitUrl,
  toCharacterInfo,
} from "../../src/protocol/character.ts"

// characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const FULL_DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  accent: "#f2b0a0",
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

describe("availableExpressions", () => {
  it("立ち絵がある表情だけを返す", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)

    expect(definition).toBeDefined()
    expect(availableExpressions(definition)).toEqual(["default", "working", "proud", "flustered"])
  })

  it("立ち絵が一部しか無い定義では、その表情と default だけを返す", () => {
    const definition: CharacterDefinition = {
      name: undefined,
      accent: undefined,
      portraits: {
        default: undefined,
        working: "working.svg",
        proud: undefined,
        flustered: undefined,
      },
      outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
    }

    expect(availableExpressions(definition)).toEqual(["default", "working"])
  })

  it("定義が無いときは default だけを返す（受け付ける表情名が空にならない）", () => {
    expect(availableExpressions(undefined)).toEqual(["default"])
  })
})

describe("resolvePortraitUrl", () => {
  const portraitsWithoutWorking = {
    default: "default.svg",
    working: undefined,
    proud: undefined,
    flustered: undefined,
  }

  it("該当する表情があればそれを使う", () => {
    expect(resolvePortraitUrl(portraitsWithoutWorking, "default")).toBe("default.svg")
  })

  it("見つからない表情は default に落ちる", () => {
    expect(resolvePortraitUrl(portraitsWithoutWorking, "working")).toBe("default.svg")
  })

  it("default も無ければ undefined（立ち絵なしにフォールバック）", () => {
    const empty = { default: undefined, working: undefined, proud: undefined, flustered: undefined }

    expect(resolvePortraitUrl(empty, "working")).toBeUndefined()
  })
})

describe("resolveOutfitAccent", () => {
  it("該当する衣装があればそれを使う", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(
      definition === undefined ? undefined : resolveOutfitAccent(definition.outfitAccents, "heavy"),
    ).toBe("#ffb3a7")
  })

  it("見つからない衣装は default に落ちる", () => {
    const outfitAccents = {
      default: "#b8c7ff",
      light: undefined,
      normal: undefined,
      heavy: undefined,
    }

    expect(resolveOutfitAccent(outfitAccents, "light")).toBe("#b8c7ff")
  })
})

describe("characterAssetPath", () => {
  it("/character/<file> の形にする", () => {
    expect(characterAssetPath("default.svg")).toBe("/character/default.svg")
  })
})

describe("toCharacterInfo", () => {
  it("ファイル名を /character/<file> の URL に変える", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(definition).toBeDefined()

    const info = definition === undefined ? undefined : toCharacterInfo(definition)

    expect(info?.name).toBe("架空の精霊")
    expect(info?.accent).toBe("#f2b0a0")
    expect(info?.expressions).toEqual(["default", "working", "proud", "flustered"])
    expect(info?.portraits.working).toBe("/character/working.svg")
    expect(info?.outfitAccents.heavy).toBe("#ffb3a7")
  })

  it("定義が無いときは、立ち絵なし・default だけの形にする", () => {
    const info = toCharacterInfo(undefined)

    expect(info.name).toBeUndefined()
    expect(info.accent).toBeUndefined()
    expect(info.expressions).toEqual(["default"])
    expect(info.portraits.default).toBeUndefined()
    expect(info.outfitAccents.default).toBeUndefined()
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
