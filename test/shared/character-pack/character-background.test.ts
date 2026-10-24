import { describe, expect, it } from "vitest"

import {
  backgroundFileName,
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUND_DATA_URL_LENGTH,
  MAX_BACKGROUND_VEIL,
  MIN_BACKGROUND_VEIL,
  parseBackgroundImage,
  toCharacterBackground,
} from "../../../src/shared/character-pack/character-background.ts"

// 中身は見ないので、base64 として読める短い文字列で足りる（実物の画像は使わない）。
const IMAGE_BASE64 = "iVBORw0KGgo="

/** veil を省いた・読めないときの覆いの不透明度。 */
const DEFAULT_BACKGROUND_VEIL = 0.75

/** 素材のファイル名として受けるか（受けなければ背景そのものが無い）。 */
const acceptsImage = (image: string): boolean => toCharacterBackground({ image }) !== undefined

describe("toCharacterBackground", () => {
  it("素材のファイル名と覆いの不透明度をそのまま持つ", () => {
    expect(toCharacterBackground({ image: "background.png", veil: 0.8 })).toEqual({
      image: "background.png",
      veil: 0.8,
    })
  })

  it("veil を省略したら既定に落ちる", () => {
    expect(toCharacterBackground({ image: "background.jpg" })?.veil).toBe(DEFAULT_BACKGROUND_VEIL)
  })

  it("背景そのものが無い・形が違うときは undefined（背景なし）", () => {
    expect(toCharacterBackground(undefined)).toBeUndefined()
    expect(toCharacterBackground("background.png")).toBeUndefined()
    expect(toCharacterBackground(["background.png"])).toBeUndefined()
    expect(toCharacterBackground({ veil: 0.8 })).toBeUndefined()
    expect(toCharacterBackground({ image: 3 })).toBeUndefined()
  })

  it("素材のファイル名が使えない形なら undefined（既定の絵には落ちない）", () => {
    expect(toCharacterBackground({ image: "../../etc/passwd" })).toBeUndefined()
    expect(toCharacterBackground({ image: "dir/background.png" })).toBeUndefined()
    expect(toCharacterBackground({ image: 'a.png") url("evil.png' })).toBeUndefined()
    expect(toCharacterBackground({ image: "background.gif" })).toBeUndefined()
    expect(toCharacterBackground({ image: "background.svg" })).toBeUndefined()
  })
})

describe("toCharacterBackground の veil", () => {
  it.each([
    ["帯の中の数はそのまま", 0.8, 0.8],
    ["下限はそのまま", MIN_BACKGROUND_VEIL, MIN_BACKGROUND_VEIL],
    ["上限はそのまま", MAX_BACKGROUND_VEIL, MAX_BACKGROUND_VEIL],
    ["下限を下回る値は引き上げる", 0.2, MIN_BACKGROUND_VEIL],
    ["負の値は下限へ寄せる", -1, MIN_BACKGROUND_VEIL],
    ["上限を超える値は上限へ寄せる", 3, MAX_BACKGROUND_VEIL],
    ["数でない値は既定に落ちる", "0.8", DEFAULT_BACKGROUND_VEIL],
    ["null は既定に落ちる", null, DEFAULT_BACKGROUND_VEIL],
    ["NaN は既定に落ちる", Number.NaN, DEFAULT_BACKGROUND_VEIL],
    ["有限でない値は既定に落ちる", Number.POSITIVE_INFINITY, DEFAULT_BACKGROUND_VEIL],
  ])("%s", (_name, veil, expected) => {
    expect(toCharacterBackground({ image: "background.png", veil })?.veil).toBe(expected)
  })
})

describe("toCharacterBackground の素材のファイル名", () => {
  it("受け付けるのは .png / .jpg / .jpeg / .webp だけ", () => {
    expect(acceptsImage("background.png")).toBe(true)
    expect(acceptsImage("forest.JPG")).toBe(true)
    expect(acceptsImage("room.jpeg")).toBe(true)
    expect(acceptsImage("room.webp")).toBe(true)
    expect(acceptsImage("motion.gif")).toBe(false)
    expect(acceptsImage("vector.svg")).toBe(false)
    expect(acceptsImage("background")).toBe(false)
  })

  it("パスの区切り・空白・引用符が入った名前は通さない", () => {
    expect(acceptsImage("../background.png")).toBe(false)
    expect(acceptsImage("sub/background.png")).toBe(false)
    expect(acceptsImage("back ground.png")).toBe(false)
    expect(acceptsImage('back").png')).toBe(false)
    expect(acceptsImage("")).toBe(false)
  })
})

describe("parseBackgroundImage", () => {
  it("png / jpeg / webp を読む", () => {
    expect(parseBackgroundImage(`data:image/png;base64,${IMAGE_BASE64}`)).toEqual({
      format: "png",
      base64: IMAGE_BASE64,
    })
    expect(parseBackgroundImage(`data:image/jpeg;base64,${IMAGE_BASE64}`)?.format).toBe("jpg")
    expect(parseBackgroundImage(`data:image/webp;base64,${IMAGE_BASE64}`)?.format).toBe("webp")
  })

  it("立ち絵の種類（svg / gif）は受け取らない", () => {
    expect(parseBackgroundImage(`data:image/svg+xml;base64,${IMAGE_BASE64}`)).toBeUndefined()
    expect(parseBackgroundImage(`data:image/gif;base64,${IMAGE_BASE64}`)).toBeUndefined()
  })

  it("data URL として読めない値は undefined", () => {
    expect(parseBackgroundImage("https://example.com/background.png")).toBeUndefined()
    expect(parseBackgroundImage("data:image/png,AAAA")).toBeUndefined()
    expect(parseBackgroundImage("")).toBeUndefined()
  })

  it("上限を超える大きさは受け取らない", () => {
    const withinLimit = `data:image/png;base64,${"A".repeat(Math.floor(MAX_BACKGROUND_BYTES / 3) * 4)}`
    const overLimit = `data:image/png;base64,${"A".repeat(MAX_BACKGROUND_DATA_URL_LENGTH + 4)}`

    expect(parseBackgroundImage(withinLimit)).toBeDefined()
    expect(parseBackgroundImage(overLimit)).toBeUndefined()
  })
})

describe("backgroundFileName", () => {
  it("形式からだけ組み立てる（届いた名前をパスにしない）", () => {
    expect(backgroundFileName("png")).toBe("background.png")
    expect(backgroundFileName("jpg")).toBe("background.jpg")
    expect(backgroundFileName("webp")).toBe("background.webp")
  })
})
