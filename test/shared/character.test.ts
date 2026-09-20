import { describe, expect, it } from "bun:test"

import { parseCharacterDefinition } from "../../src/shared/character-definition.ts"
import {
  resolveOutfitAccent,
  resolvePortraitUrl,
  toCharacterInfo,
} from "../../src/shared/character.ts"

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

describe("resolvePortraitUrl", () => {
  const portraitsWithoutThinking = {
    default: "default.svg",
    thinking: undefined,
    proud: undefined,
    flustered: undefined,
    serious: undefined,
    curious: undefined,
    sad: undefined,
    excited: undefined,
  }

  it("該当する表情があればそれを使う", () => {
    expect(resolvePortraitUrl(portraitsWithoutThinking, "default")).toBe("default.svg")
  })

  it("見つからない表情は default に落ちる", () => {
    expect(resolvePortraitUrl(portraitsWithoutThinking, "thinking")).toBe("default.svg")
  })

  it("新しく足した表情（serious / curious）も、立ち絵が無ければ default に落ちる", () => {
    expect(resolvePortraitUrl(portraitsWithoutThinking, "serious")).toBe("default.svg")
    expect(resolvePortraitUrl(portraitsWithoutThinking, "curious")).toBe("default.svg")
  })

  it("default も無ければ undefined（立ち絵なしにフォールバック）", () => {
    const empty = {
      default: undefined,
      thinking: undefined,
      proud: undefined,
      flustered: undefined,
      serious: undefined,
      curious: undefined,
      sad: undefined,
      excited: undefined,
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

  it("mini があればその URL、無ければ portraits.default に落ちる（縮小して使う）", () => {
    const withMini = parseCharacterDefinition(
      JSON.stringify({ mini: "mini.png", portraits: { default: "default.svg" } }),
    )
    const withoutMini = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg" } }),
    )

    expect(
      withMini === undefined
        ? undefined
        : toCharacterInfo({
            definition: withMini,
            pack: "fictional",
            revision: "2",
            editable: true,
          }).mini,
    ).toBe("/character/mini.png?v=fictional%402")
    expect(
      withoutMini === undefined
        ? undefined
        : toCharacterInfo({
            definition: withoutMini,
            pack: "fictional",
            revision: "2",
            editable: true,
          }).mini,
    ).toBe("/character/default.svg?v=fictional%402")
  })

  it("背景も /character/<file> の URL にする（覆いの濃さはそのまま）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ background: { image: "background.png", veil: 0.8 } }),
    )

    expect(
      definition === undefined
        ? undefined
        : toCharacterInfo({ definition, pack: "fictional", revision: "2", editable: true })
            .background,
    ).toEqual({ image: "/character/background.png?v=fictional%402", veil: 0.8 })
  })

  it("背景が無いパックでは undefined（背景を出さない）", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)

    expect(
      definition === undefined
        ? undefined
        : toCharacterInfo({ definition, pack: "fictional", revision: undefined, editable: true })
            .background,
    ).toBeUndefined()
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
    expect(info.mini).toBeUndefined()
    expect(info.outfitAccents.default).toBeUndefined()
    expect(info.background).toBeUndefined()
    expect(info.editable).toBe(false)
  })
})
