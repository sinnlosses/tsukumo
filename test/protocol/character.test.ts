import { describe, expect, it } from "bun:test"

import {
  characterAssetCacheKey,
  characterAssetPath,
  classifyPortraitFile,
  type CharacterDefinition,
  definitionWithOutfitAccent,
  definitionWithoutPortrait,
  definitionWithPortrait,
  parseCharacterDefinition,
  expressionChoices,
  expressionNames,
  rasterMimeType,
  resolveExpressionLabel,
  resolveOutfitAccent,
  resolvePortraitUrl,
  toCharacterInfo,
} from "../../src/protocol/character.ts"

// characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const FULL_DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  accent: "#f2b0a0",
  speechMarker: "精霊: ",
  expressions: {
    default: "通常",
    thinking: "作業中",
    proud: "どや顔",
    flustered: "あわあわ",
  },
  portraits: {
    default: "default.svg",
    thinking: "thinking.svg",
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
    expect(definition?.portraits.thinking).toBe("thinking.svg")
    expect(definition?.outfitAccents.heavy).toBe("#ffb3a7")
  })

  it("見つからない表情・衣装は undefined になる（キー自体は消えない）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg" }, outfitAccents: {} }),
    )

    expect(definition?.portraits.default).toBe("default.svg")
    expect(definition?.portraits.thinking).toBeUndefined()
    expect(definition?.outfitAccents.default).toBeUndefined()
  })

  it("expressions（表情名 → ラベル）と speechMarker を読む", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)

    expect(definition?.expressions.thinking).toBe("作業中")
    expect(definition?.speechMarker).toBe("精霊: ")
  })

  it("expressions / speechMarker が無ければ undefined に落ちる（既定はコード側に持たない）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg" } }),
    )

    expect(definition?.expressions.thinking).toBeUndefined()
    expect(definition?.speechMarker).toBeUndefined()
  })

  it("expressions / speechMarker の型が違うときも undefined に落ちる", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ expressions: "not an object", speechMarker: 42 }),
    )

    expect(definition?.expressions.default).toBeUndefined()
    expect(definition?.speechMarker).toBeUndefined()
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

describe("expressionChoices", () => {
  it("定義の expressions をラベルにする", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)

    expect(definition).toBeDefined()
    expect(expressionChoices(definition)).toEqual([
      { name: "default", label: "通常" },
      { name: "thinking", label: "作業中" },
      { name: "proud", label: "どや顔" },
      { name: "flustered", label: "あわあわ" },
    ])
  })

  it("ラベルが無い表情は、表情名がそのままラベルになる", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg", thinking: "thinking.svg" } }),
    )

    expect(expressionChoices(definition)).toEqual([
      { name: "default", label: "default" },
      { name: "thinking", label: "thinking" },
    ])
  })

  it("立ち絵が一部しか無い定義では、その表情と default だけを返す", () => {
    const definition: CharacterDefinition = {
      name: undefined,
      accent: undefined,
      expressions: {
        default: undefined,
        thinking: undefined,
        proud: undefined,
        flustered: undefined,
      },
      speechMarker: undefined,
      portraits: {
        default: undefined,
        thinking: "thinking.svg",
        proud: undefined,
        flustered: undefined,
      },
      outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
    }

    expect(expressionNames(expressionChoices(definition))).toEqual(["default", "thinking"])
  })

  it("立ち絵が無くてもラベルがあれば選べる（絵は default に落ちる）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg" }, expressions: { proud: "どや顔" } }),
    )

    expect(expressionNames(expressionChoices(definition))).toEqual(["default", "proud"])
  })

  it("定義が無いときは default だけを返す（受け付ける表情名が空にならない）", () => {
    expect(expressionChoices(undefined)).toEqual([{ name: "default", label: "default" }])
  })
})

describe("resolveExpressionLabel", () => {
  it("一覧にある表情はそのラベルを返す", () => {
    const choices = expressionChoices(parseCharacterDefinition(FULL_DEFINITION_JSON))

    expect(resolveExpressionLabel(choices, "proud")).toBe("どや顔")
  })

  it("一覧に無い表情は表情名をそのまま返す", () => {
    expect(resolveExpressionLabel([], "thinking")).toBe("thinking")
  })
})

describe("resolvePortraitUrl", () => {
  const portraitsWithoutThinking = {
    default: "default.svg",
    thinking: undefined,
    proud: undefined,
    flustered: undefined,
  }

  it("該当する表情があればそれを使う", () => {
    expect(resolvePortraitUrl(portraitsWithoutThinking, "default")).toBe("default.svg")
  })

  it("見つからない表情は default に落ちる", () => {
    expect(resolvePortraitUrl(portraitsWithoutThinking, "thinking")).toBe("default.svg")
  })

  it("default も無ければ undefined（立ち絵なしにフォールバック）", () => {
    const empty = {
      default: undefined,
      thinking: undefined,
      proud: undefined,
      flustered: undefined,
    }

    expect(resolvePortraitUrl(empty, "thinking")).toBeUndefined()
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

describe("toCharacterInfo", () => {
  it("ファイル名を /character/<file> の URL に変える", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(definition).toBeDefined()

    const info =
      definition === undefined
        ? undefined
        : toCharacterInfo({
            definition,
            pack: "fictional",
            revision: undefined,
            editable: true,
          })

    expect(info?.pack).toBe("fictional")
    expect(info?.editable).toBe(true)
    expect(info?.name).toBe("架空の精霊")
    expect(info?.accent).toBe("#f2b0a0")
    expect(info?.speechMarker).toBe("精霊: ")
    expect(info?.expressions.map((choice) => choice.name)).toEqual([
      "default",
      "thinking",
      "proud",
      "flustered",
    ])
    expect(info?.portraits.thinking).toBe("/character/thinking.svg?v=fictional")
    expect(info?.outfitAccents.heavy).toBe("#ffb3a7")
  })

  it("pack が違えば、同じファイル名でも URL が変わる", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(definition).toBeDefined()
    if (definition === undefined) {
      return
    }

    const infoA = toCharacterInfo({
      definition,
      pack: "pack-a",
      revision: undefined,
      editable: true,
    })
    const infoB = toCharacterInfo({
      definition,
      pack: "pack-b",
      revision: undefined,
      editable: true,
    })

    expect(infoA.portraits.default).not.toBe(infoB.portraits.default)
    expect(infoA.portraits.default).toBe("/character/default.svg?v=pack-a")
    expect(infoB.portraits.default).toBe("/character/default.svg?v=pack-b")
  })

  it("素材の版が違えば、同じパック・同じファイル名でも URL が変わる（差し替えたら取り直す）", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(definition).toBeDefined()
    if (definition === undefined) {
      return
    }

    const before = toCharacterInfo({ definition, pack: "same", revision: "1", editable: true })
    const after = toCharacterInfo({ definition, pack: "same", revision: "2", editable: true })

    expect(before.portraits.default).not.toBe(after.portraits.default)
  })

  it("pack が undefined のときは問い合わせ文字列を付けない（既定の場所を直に指したときなど）", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(definition).toBeDefined()

    const info =
      definition === undefined
        ? undefined
        : toCharacterInfo({ definition, pack: undefined, revision: undefined, editable: true })

    expect(info?.portraits.default).toBe("/character/default.svg")
  })

  it("定義が無いときは、立ち絵なし・default だけの形にする", () => {
    const info = toCharacterInfo({
      definition: undefined,
      pack: undefined,
      revision: undefined,
      editable: false,
    })

    expect(info.pack).toBeUndefined()
    expect(info.name).toBeUndefined()
    expect(info.accent).toBeUndefined()
    expect(info.speechMarker).toBeUndefined()
    expect(info.expressions).toEqual([{ name: "default", label: "default" }])
    expect(info.portraits.default).toBeUndefined()
    expect(info.outfitAccents.default).toBeUndefined()
    expect(info.editable).toBe(false)
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

describe("definitionWithPortrait / definitionWithoutPortrait / definitionWithOutfitAccent", () => {
  it("立ち絵1件を差し替え、ほかのキーは残す", () => {
    const edited = definitionWithPortrait(FULL_DEFINITION_JSON, "proud", "proud.png")
    const definition = parseCharacterDefinition(edited)

    expect(definition?.portraits.proud).toBe("proud.png")
    // 手で書いた値（name / license / accent / ほかの表情）はそのまま。
    expect(definition?.name).toBe("架空の精霊")
    expect(definition?.accent).toBe("#f2b0a0")
    expect(definition?.portraits.default).toBe("default.svg")
    expect(JSON.parse(edited)["license"]).toBe("テスト用に手で書いたもの")
  })

  it("立ち絵1件を消すと、その表情のキーが消える（ほかは残る）", () => {
    const edited = definitionWithoutPortrait(FULL_DEFINITION_JSON, "flustered")
    const definition = parseCharacterDefinition(edited)

    expect(definition?.portraits.flustered).toBeUndefined()
    expect(definition?.portraits.proud).toBe("proud.svg")
    // ラベル（`expressions`）は消さない（立ち絵が無くても `speak` で選べる。4.4）。
    expect(definition?.expressions.flustered).toBe("あわあわ")
  })

  it("差し色1件を差し替える", () => {
    const edited = definitionWithOutfitAccent(FULL_DEFINITION_JSON, "heavy", "#123456")
    const definition = parseCharacterDefinition(edited)

    expect(definition?.outfitAccents.heavy).toBe("#123456")
    expect(definition?.outfitAccents.default).toBe("#b8c7ff")
  })

  it("定義が無い・壊れているときは、その1件だけを持つ定義を作る", () => {
    expect(
      parseCharacterDefinition(definitionWithPortrait(undefined, "default", "default.png"))
        ?.portraits.default,
    ).toBe("default.png")
    expect(
      parseCharacterDefinition(definitionWithOutfitAccent("{壊れた", "light", "#a8e6c0"))
        ?.outfitAccents.light,
    ).toBe("#a8e6c0")
  })

  it("書き出す JSON は2スペース整形で、末尾に改行を付ける（手で編集できる形）", () => {
    const edited = definitionWithOutfitAccent(FULL_DEFINITION_JSON, "light", "#a8e6c0")

    expect(edited.endsWith("\n")).toBe(true)
    expect(edited).toContain('\n  "outfitAccents": {')
  })
})
