import { describe, expect, it } from "bun:test"

import {
  definitionWithOutfitAccent,
  definitionWithoutPortrait,
  definitionWithPortrait,
  parseCharacterDefinition,
} from "../../src/shared/character-definition.ts"

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
