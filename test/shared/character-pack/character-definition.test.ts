import { describe, expect, it } from "vitest"

import {
  definitionWithAccent,
  definitionWithBackground,
  definitionWithFace,
  definitionWithMini,
  definitionWithoutBackground,
  definitionWithoutChatAccent,
  definitionWithoutFace,
  definitionWithoutMini,
  definitionWithoutPortrait,
  definitionWithPortrait,
  parseCharacterDefinition,
} from "../../../src/shared/character-pack/character-definition.ts"
import { toCharacterInfo } from "../../../src/shared/character-pack/character.ts"
import { FULL_DEFINITION_JSON } from "../../fixture/character.ts"

describe("parseCharacterDefinition", () => {
  it("あるものだけの portraits をそのまま持つ", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)

    expect(definition?.name).toBe("架空の精霊")
    expect(definition?.portraits.thinking).toBe("thinking.svg")
  })

  it("見つからない表情は undefined になる（キー自体は消えない）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg" } }),
    )

    expect(definition?.portraits.default).toBe("default.svg")
    expect(definition?.portraits.thinking).toBeUndefined()
  })

  it("古い版の outfitAccents が残っていても読めて、結果には現れない", () => {
    const json = JSON.stringify({
      name: "架空の精霊",
      portraits: { default: "default.svg" },
      outfitAccents: { default: "#b8c7ff", heavy: "#ffb3a7" },
    })

    const definition = parseCharacterDefinition(json)
    expect(definition?.name).toBe("架空の精霊")
    expect(definition).not.toHaveProperty("outfitAccents")
    if (definition === undefined) {
      throw new Error("定義が読めなかった")
    }
    const info = toCharacterInfo({
      definition,
      pack: "fictional",
      revision: undefined,
      editable: true,
    })
    expect(info).not.toHaveProperty("outfitAccents")
  })

  it("任意の mini（ミニ立ち絵の素材）を読む。無ければ undefined", () => {
    expect(parseCharacterDefinition(JSON.stringify({ mini: "mini.png" }))?.mini).toBe("mini.png")
    expect(parseCharacterDefinition(FULL_DEFINITION_JSON)?.mini).toBeUndefined()
    expect(parseCharacterDefinition(JSON.stringify({ mini: 3 }))?.mini).toBeUndefined()
  })

  it("任意の face（帯に出す顔の素材）を読む。無い・壊れた値は undefined", () => {
    expect(parseCharacterDefinition(JSON.stringify({ face: "face.png" }))?.face).toBe("face.png")
    expect(parseCharacterDefinition(FULL_DEFINITION_JSON)?.face).toBeUndefined()
    expect(parseCharacterDefinition(JSON.stringify({ face: 3 }))?.face).toBeUndefined()
  })

  it("任意の tagline（自己紹介文）を読む。無い・壊れた値・空白だけは undefined", () => {
    expect(
      parseCharacterDefinition(JSON.stringify({ tagline: "窓辺に棲む架空の精霊" }))?.tagline,
    ).toBe("窓辺に棲む架空の精霊")
    expect(parseCharacterDefinition(FULL_DEFINITION_JSON)?.tagline).toBeUndefined()
    expect(parseCharacterDefinition(JSON.stringify({ tagline: 3 }))?.tagline).toBeUndefined()
    expect(parseCharacterDefinition(JSON.stringify({ tagline: "  " }))?.tagline).toBeUndefined()
  })

  it("任意の userCall / miniCall（利用者とミニ立ち絵の呼び名）を読む。無い・壊れた値・空白だけは undefined", () => {
    const parsed = parseCharacterDefinition(
      JSON.stringify({ userCall: "あるじ", miniCall: "架空の使い魔" }),
    )
    expect(parsed?.userCall).toBe("あるじ")
    expect(parsed?.miniCall).toBe("架空の使い魔")
    expect(parseCharacterDefinition(FULL_DEFINITION_JSON)?.userCall).toBeUndefined()
    expect(parseCharacterDefinition(JSON.stringify({ userCall: 3 }))?.userCall).toBeUndefined()
    expect(parseCharacterDefinition(JSON.stringify({ miniCall: " " }))?.miniCall).toBeUndefined()
  })

  it("任意の chatAccent（雑談中だけの accent）を読む。無い・壊れた値は undefined", () => {
    expect(parseCharacterDefinition(JSON.stringify({ chatAccent: "#f2984a" }))?.chatAccent).toBe(
      "#f2984a",
    )
    expect(parseCharacterDefinition(FULL_DEFINITION_JSON)?.chatAccent).toBeUndefined()
    expect(parseCharacterDefinition(JSON.stringify({ chatAccent: 3 }))?.chatAccent).toBeUndefined()
  })

  it("expressions の型が違うときも undefined に落ちる", () => {
    const definition = parseCharacterDefinition(JSON.stringify({ expressions: "not an object" }))

    expect(definition?.expressions.default).toBeUndefined()
  })

  it("name が無くても壊れない", () => {
    const definition = parseCharacterDefinition(JSON.stringify({ portraits: {} }))

    expect(definition?.name).toBeUndefined()
  })

  it("JSON として不正なときは undefined", () => {
    expect(parseCharacterDefinition("{this is not valid json")).toBeUndefined()
  })

  it("トップレベルが配列など、オブジェクトでないときは undefined", () => {
    expect(parseCharacterDefinition("[1, 2, 3]")).toBeUndefined()
    expect(parseCharacterDefinition("null")).toBeUndefined()
  })

  it("background（素材のファイル名と覆いの濃さ）を読む。壊れた値は背景なしに落ちる", () => {
    const withBackground = parseCharacterDefinition(
      JSON.stringify({ background: { image: "background.png", veil: 0.8 } }),
    )
    expect(withBackground?.background).toEqual({ image: "background.png", veil: 0.8 })

    expect(parseCharacterDefinition(FULL_DEFINITION_JSON)?.background).toBeUndefined()
    expect(
      parseCharacterDefinition(JSON.stringify({ background: { image: "../evil.png" } }))
        ?.background,
    ).toBeUndefined()
  })

  it("diaryFont（日記の書体のファイル名）を読む。無い・壊れた値・パックの外を指す値は undefined", () => {
    expect(parseCharacterDefinition(JSON.stringify({ diaryFont: "shodo.woff2" }))?.diaryFont).toBe(
      "shodo.woff2",
    )
    expect(parseCharacterDefinition(FULL_DEFINITION_JSON)?.diaryFont).toBeUndefined()
    expect(parseCharacterDefinition(JSON.stringify({ diaryFont: 3 }))?.diaryFont).toBeUndefined()
    expect(
      parseCharacterDefinition(JSON.stringify({ diaryFont: "../evil.woff2" }))?.diaryFont,
    ).toBeUndefined()
    expect(
      parseCharacterDefinition(JSON.stringify({ diaryFont: "shodo.png" }))?.diaryFont,
    ).toBeUndefined()
  })

  it("portraits が無い・型が違っても、キーはすべて undefined として持つ", () => {
    const definition = parseCharacterDefinition(JSON.stringify({ portraits: "not an object" }))

    expect(definition?.portraits.default).toBeUndefined()
  })
})

describe("definitionWithPortrait / definitionWithoutPortrait", () => {
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

  it("定義が無い・壊れているときは、その1件だけを持つ定義を作る", () => {
    expect(
      parseCharacterDefinition(definitionWithPortrait(undefined, "default", "default.png"))
        ?.portraits.default,
    ).toBe("default.png")
    expect(
      parseCharacterDefinition(definitionWithPortrait("{壊れた", "thinking", "thinking.png"))
        ?.portraits.thinking,
    ).toBe("thinking.png")
  })

  it("書き出す JSON は2スペース整形で、末尾に改行を付ける（手で編集できる形）", () => {
    const edited = definitionWithPortrait(FULL_DEFINITION_JSON, "proud", "proud.png")

    expect(edited.endsWith("\n")).toBe(true)
    expect(edited).toContain('\n  "portraits": {')
  })
})

describe("definitionWithAccent / definitionWithoutChatAccent", () => {
  it("仕事の差し色（accent）を差し替え、ほかのキーは残す", () => {
    const edited = definitionWithAccent(FULL_DEFINITION_JSON, "work", "#123456")
    const definition = parseCharacterDefinition(edited)

    expect(definition?.accent).toBe("#123456")
    expect(definition?.name).toBe("架空の精霊")
    expect(definition?.portraits.default).toBe("default.svg")
  })

  it("雑談の差し色（chatAccent）を差し替え、仕事の差し色（accent）はそのまま", () => {
    const edited = definitionWithAccent(FULL_DEFINITION_JSON, "chat", "#f2984a")
    const definition = parseCharacterDefinition(edited)

    expect(definition?.chatAccent).toBe("#f2984a")
    expect(definition?.accent).toBe("#f2b0a0")
  })

  it("chatAccent を消すと欄が無くなり、ほかのキーは残る（仕事と同じにする）", () => {
    const withChatAccent = definitionWithAccent(FULL_DEFINITION_JSON, "chat", "#f2984a")

    const cleared = definitionWithoutChatAccent(withChatAccent)

    expect(parseCharacterDefinition(cleared)?.chatAccent).toBeUndefined()
    expect(JSON.parse(cleared)).not.toHaveProperty("chatAccent")
    expect(parseCharacterDefinition(cleared)?.accent).toBe("#f2b0a0")
    expect(parseCharacterDefinition(cleared)?.name).toBe("架空の精霊")
  })

  it("定義が無い・壊れているときは、その1件だけを持つ定義を作る", () => {
    expect(
      parseCharacterDefinition(definitionWithAccent(undefined, "work", "#123456"))?.accent,
    ).toBe("#123456")
    expect(
      parseCharacterDefinition(definitionWithAccent("{壊れた", "chat", "#f2984a"))?.chatAccent,
    ).toBe("#f2984a")
  })
})

describe("definitionWithBackground / definitionWithoutBackground", () => {
  it("背景の素材を差し替え、ほかのキーは残す", () => {
    const edited = definitionWithBackground(FULL_DEFINITION_JSON, "background.png")
    const definition = parseCharacterDefinition(edited)

    expect(definition?.background?.image).toBe("background.png")
    expect(definition?.name).toBe("架空の精霊")
    expect(definition?.portraits.default).toBe("default.svg")
  })

  it("差し替えても覆いの濃さ（veil）はそのまま残る", () => {
    const withVeil = JSON.stringify({ background: { image: "old.jpg", veil: 0.9 } })
    const definition = parseCharacterDefinition(definitionWithBackground(withVeil, "new.png"))

    expect(definition?.background).toEqual({ image: "new.png", veil: 0.9 })
  })

  it("消すと背景なしになる（濃さは残るが、素材が無いので出ない）", () => {
    const withVeil = JSON.stringify({ background: { image: "old.jpg", veil: 0.9 } })
    const edited = definitionWithoutBackground(withVeil)

    expect(parseCharacterDefinition(edited)?.background).toBeUndefined()
    expect(JSON.parse(edited)["background"]).toEqual({ veil: 0.9 })
  })
})

describe("definitionWithMini / definitionWithoutMini", () => {
  it("ミニ立ち絵の素材を差し替え、ほかのキーは残す", () => {
    const edited = definitionWithMini(FULL_DEFINITION_JSON, "mini.png")
    const definition = parseCharacterDefinition(edited)

    expect(definition?.mini).toBe("mini.png")
    expect(definition?.name).toBe("架空の精霊")
    expect(definition?.portraits.default).toBe("default.svg")
  })

  it("外すとミニ立ち絵なしになり、ほかのキーは残す", () => {
    const withMini = JSON.stringify({ mini: "old.png", miniCall: "使い魔", face: "face.png" })
    const definition = parseCharacterDefinition(definitionWithoutMini(withMini))

    expect(definition?.mini).toBeUndefined()
    expect(definition?.miniCall).toBe("使い魔")
    expect(definition?.face).toBe("face.png")
  })
})

describe("definitionWithFace / definitionWithoutFace", () => {
  it("顔の素材を差し替え、ほかのキーは残す", () => {
    const edited = definitionWithFace(FULL_DEFINITION_JSON, "face.png")
    const definition = parseCharacterDefinition(edited)

    expect(definition?.face).toBe("face.png")
    expect(definition?.name).toBe("架空の精霊")
    expect(definition?.portraits.default).toBe("default.svg")
  })

  it("消すと顔なしになる", () => {
    const withFace = JSON.stringify({ face: "old.png" })
    const edited = definitionWithoutFace(withFace)

    expect(parseCharacterDefinition(edited)?.face).toBeUndefined()
  })
})
