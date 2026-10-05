import { describe, expect, it } from "vitest"

import { parseCharacterDefinition } from "../../../src/shared/character-pack/character-definition.ts"
import {
  type CharacterInfo,
  type CharacterInfoSource,
  effectiveAccent,
  toCharacterInfo,
} from "../../../src/shared/character-pack/character.ts"
import { expressionChoices } from "../../../src/shared/character-pack/expression-choice.ts"
import { EXPRESSIONS } from "../../../src/shared/character-pack/expression.ts"
import { characterInfo, FULL_DEFINITION_JSON } from "../../fixture/character.ts"

/** 定義ファイルの JSON から、画面に渡る姿を作る。 */
function infoOf(
  json: string,
  revision: CharacterInfoSource["revision"] = undefined,
): CharacterInfo | undefined {
  const definition = parseCharacterDefinition(json)
  return definition === undefined
    ? undefined
    : toCharacterInfo({ definition, pack: "fictional", revision, editable: true })
}

describe("toCharacterInfo の畳み方", () => {
  const withoutThinking = JSON.stringify({ portraits: { default: "default.svg" } })

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
    const info = infoOf(FULL_DEFINITION_JSON)
    expect(info).toBeDefined()

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

  it("mini があればその URL、無ければ portraits.default に落ちる（縮小して使う）", () => {
    const withMini = JSON.stringify({ mini: "mini.png", portraits: { default: "default.svg" } })
    const withoutMini = JSON.stringify({ portraits: { default: "default.svg" } })

    expect(infoOf(withMini, "2")?.mini).toBe("/character/fictional/mini.png?v=2")
    expect(infoOf(withoutMini, "2")?.mini).toBe("/character/fictional/default.svg?v=2")
  })

  it("face があればその URL（mini と違い、default の立ち絵には畳まない）", () => {
    const json = JSON.stringify({ face: "face.png", portraits: { default: "default.svg" } })

    expect(infoOf(json, "2")?.face).toBe("/character/fictional/face.png?v=2")
  })

  it("face が無いパックでは undefined（mini や portraits.default から補わない）", () => {
    const json = JSON.stringify({ portraits: { default: "default.svg" }, mini: "mini.png" })

    expect(infoOf(json, "2")?.face).toBeUndefined()
  })

  it("diaryFont があればその URL（無いパックでは undefined。face と同じくフォールバックしない）", () => {
    const withFont = JSON.stringify({
      diaryFont: "shodo.woff2",
      portraits: { default: "default.svg" },
    })
    const withoutFont = JSON.stringify({ portraits: { default: "default.svg" } })

    expect(infoOf(withFont, "2")?.diaryFont).toBe("/character/fictional/shodo.woff2?v=2")
    expect(infoOf(withoutFont, "2")?.diaryFont).toBeUndefined()
  })

  it("背景も /character/<pack>/<file> の URL にする（覆いの濃さはそのまま）", () => {
    const json = JSON.stringify({ background: { image: "background.png", veil: 0.8 } })

    expect(infoOf(json, "2")?.background).toEqual({
      image: "/character/fictional/background.png?v=2",
      veil: 0.8,
    })
  })

  it("背景が無いパックでは undefined（背景を出さない）", () => {
    expect(infoOf(FULL_DEFINITION_JSON)?.background).toBeUndefined()
  })

  it("tagline（ひとことプロフィール）があればそのまま持つ", () => {
    expect(infoOf(JSON.stringify({ tagline: "架空のひとこと" }))?.tagline).toBe("架空のひとこと")
  })

  it("chatAccent があればそのまま持つ", () => {
    const json = JSON.stringify({ accent: "#6fe3cd", chatAccent: "#f2984a" })

    expect(infoOf(json)?.chatAccent).toBe("#f2984a")
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
    expect(info.diaryFont).toBeUndefined()
    expect(info.editable).toBe(false)
  })
})

describe("effectiveAccent（雑談中に切り替える accent。docs/architecture/screen-design.md 13.2「雑談中は」）", () => {
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
