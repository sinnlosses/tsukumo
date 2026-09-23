import { describe, expect, it } from "bun:test"

import { parseCharacterDefinition } from "../../src/shared/character-definition.ts"
import { type CharacterInfo, effectiveAccent, toCharacterInfo } from "../../src/shared/character.ts"
import { expressionChoices } from "../../src/shared/expression-choice.ts"
import { EXPRESSIONS } from "../../src/shared/expression.ts"
import { characterInfo } from "../fixture/character.ts"

// characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const FULL_DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  accent: "#f2b0a0",
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

/** 定義ファイルの JSON から、画面に渡る姿を作る（版の印は付けない）。 */
function infoOf(json: string): CharacterInfo | undefined {
  const definition = parseCharacterDefinition(json)
  return definition === undefined
    ? undefined
    : toCharacterInfo({ definition, pack: "fictional", revision: undefined, editable: true })
}

describe("toCharacterInfo の畳み方", () => {
  const withoutThinking = JSON.stringify({ portraits: { default: "default.svg" } })

  it("該当する表情の立ち絵があればそれを使う", () => {
    expect(infoOf(FULL_DEFINITION_JSON)?.portraits?.thinking).toBe(
      "/character/fictional/thinking.svg",
    )
  })

  it("立ち絵の無い表情は、どれも default の絵に畳む", () => {
    const shown = infoOf(withoutThinking)?.portraits
    for (const expression of EXPRESSIONS) {
      expect(shown?.[expression]).toBe("/character/fictional/default.svg")
    }
  })

  it("default も無いパックでは立ち絵の表ごと持たない（立ち絵なしにフォールバック）", () => {
    expect(
      infoOf(JSON.stringify({ portraits: { thinking: "thinking.svg" } }))?.portraits,
    ).toBeUndefined()
  })

  it("自分の立ち絵を持つ表情だけを、EXPRESSIONS の順で別に持つ", () => {
    expect(infoOf(FULL_DEFINITION_JSON)?.expressionsWithPortrait).toEqual(
      EXPRESSIONS.filter((expression) =>
        ["default", "thinking", "proud", "flustered"].includes(expression),
      ),
    )
    expect(infoOf(withoutThinking)?.expressionsWithPortrait).toEqual(["default"])
  })

  it("畳んでも speak の選択肢（定義ファイル側）は減らない", () => {
    const json = JSON.stringify({
      portraits: { default: "default.svg", proud: "proud.svg" },
      expressions: { thinking: "作業中" },
    })
    const definition = parseCharacterDefinition(json)
    expect(infoOf(json)?.expressions).toEqual(expressionChoices(definition))
    expect(infoOf(json)?.expressions.map((choice) => choice.name)).toEqual([
      "default",
      "thinking",
      "proud",
    ])
  })

  it("該当する衣装の差し色があればそれを使う", () => {
    expect(infoOf(FULL_DEFINITION_JSON)?.outfitAccents.heavy).toBe("#ffb3a7")
  })

  it("差し色の無い衣装は default に畳む", () => {
    expect(
      infoOf(JSON.stringify({ outfitAccents: { default: "#b8c7ff" } }))?.outfitAccents.light,
    ).toBe("#b8c7ff")
  })

  it("default の差し色が無くても、指定のある衣装の差し色は残す", () => {
    const accents = infoOf(JSON.stringify({ outfitAccents: { heavy: "#ffb3a7" } }))?.outfitAccents
    expect(accents?.heavy).toBe("#ffb3a7")
    expect(accents?.light).toBeUndefined()
  })
})

describe("toCharacterInfo", () => {
  it("ファイル名を /character/<pack>/<file> の URL に変える", () => {
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
    expect(info?.chatAccent).toBeUndefined()
    expect(info?.expressions.map((choice) => choice.name)).toEqual([
      "default",
      "thinking",
      "proud",
      "flustered",
    ])
    expect(info?.portraits?.thinking).toBe("/character/fictional/thinking.svg")
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

    expect(infoA.portraits?.default).not.toBe(infoB.portraits?.default)
    expect(infoA.portraits?.default).toBe("/character/pack-a/default.svg")
    expect(infoB.portraits?.default).toBe("/character/pack-b/default.svg")
  })

  it("素材の版が違えば、同じパック・同じファイル名でも URL が変わる（差し替えたら取り直す）", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(definition).toBeDefined()
    if (definition === undefined) {
      return
    }

    const before = toCharacterInfo({ definition, pack: "same", revision: "1", editable: true })
    const after = toCharacterInfo({ definition, pack: "same", revision: "2", editable: true })

    expect(before.portraits?.default).not.toBe(after.portraits?.default)
  })

  it("素材の版が無いときは問い合わせ文字列を付けない", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)
    expect(definition).toBeDefined()

    const info =
      definition === undefined
        ? undefined
        : toCharacterInfo({ definition, pack: "fictional", revision: undefined, editable: true })

    expect(info?.portraits?.default).toBe("/character/fictional/default.svg")
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
    ).toBe("/character/fictional/mini.png?v=2")
    expect(
      withoutMini === undefined
        ? undefined
        : toCharacterInfo({
            definition: withoutMini,
            pack: "fictional",
            revision: "2",
            editable: true,
          }).mini,
    ).toBe("/character/fictional/default.svg?v=2")
  })

  it("face があればその URL（mini と違い、default の立ち絵には畳まない）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ face: "face.png", portraits: { default: "default.svg" } }),
    )

    expect(
      definition === undefined
        ? undefined
        : toCharacterInfo({
            definition,
            pack: "fictional",
            revision: "2",
            editable: true,
          }).face,
    ).toBe("/character/fictional/face.png?v=2")
  })

  it("face が無いパックでは undefined（mini や portraits.default から補わない）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg" }, mini: "mini.png" }),
    )

    expect(
      definition === undefined
        ? undefined
        : toCharacterInfo({ definition, pack: "fictional", revision: "2", editable: true }).face,
    ).toBeUndefined()
  })

  it("背景も /character/<pack>/<file> の URL にする（覆いの濃さはそのまま）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ background: { image: "background.png", veil: 0.8 } }),
    )

    expect(
      definition === undefined
        ? undefined
        : toCharacterInfo({ definition, pack: "fictional", revision: "2", editable: true })
            .background,
    ).toEqual({ image: "/character/fictional/background.png?v=2", veil: 0.8 })
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

  it("tagline（ひとことプロフィール）があればそのまま持つ", () => {
    const definition = parseCharacterDefinition(JSON.stringify({ tagline: "架空のひとこと" }))

    expect(
      definition === undefined
        ? undefined
        : toCharacterInfo({ definition, pack: "fictional", revision: undefined, editable: true })
            .tagline,
    ).toBe("架空のひとこと")
  })

  it("chatAccent があればそのまま持つ", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ accent: "#6fe3cd", chatAccent: "#f2984a" }),
    )

    expect(
      definition === undefined
        ? undefined
        : toCharacterInfo({ definition, pack: "fictional", revision: undefined, editable: true })
            .chatAccent,
    ).toBe("#f2984a")
  })

  it("定義が無いときは、立ち絵なし・default だけの形にする", () => {
    const info = toCharacterInfo({
      definition: undefined,
      pack: "fictional",
      revision: undefined,
      editable: false,
    })

    expect(info.pack).toBe("fictional")
    expect(info.name).toBeUndefined()
    expect(info.accent).toBeUndefined()
    expect(info.expressions).toEqual([{ name: "default", label: "default" }])
    expect(info.portraits).toBeUndefined()
    expect(info.expressionsWithPortrait).toEqual([])
    expect(info.mini).toBeUndefined()
    expect(info.face).toBeUndefined()
    expect(info.tagline).toBeUndefined()
    expect(info.outfitAccents.default).toBeUndefined()
    expect(info.background).toBeUndefined()
    expect(info.editable).toBe(false)
  })
})

describe("effectiveAccent（雑談中に切り替える accent。docs/screen-design.md 13.2「雑談中は」）", () => {
  it("仕事中は accent のまま", () => {
    expect(
      effectiveAccent(characterInfo({ accent: "#6fe3cd", chatAccent: "#f2984a" }), false),
    ).toBe("#6fe3cd")
  })

  it("雑談中は chatAccent があればそちらに切り替わる", () => {
    expect(effectiveAccent(characterInfo({ accent: "#6fe3cd", chatAccent: "#f2984a" }), true)).toBe(
      "#f2984a",
    )
  })

  it("雑談用の色を持たないパックは、雑談中も accent のまま", () => {
    expect(effectiveAccent(characterInfo({ accent: "#6fe3cd" }), true)).toBe("#6fe3cd")
  })

  it("パックそのものが無ければ undefined（既定値に落ちる）", () => {
    expect(effectiveAccent(undefined, true)).toBeUndefined()
  })
})
