import { describe, expect, it } from "bun:test"

import {
  backgroundFileName,
  DEFAULT_BACKGROUND_VEIL,
  isBackgroundFileName,
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUND_DATA_URL_LENGTH,
  MAX_BACKGROUND_VEIL,
  MIN_BACKGROUND_VEIL,
  parseBackgroundImage,
  toBackgroundVeil,
  toCharacterBackground,
} from "../../src/shared/character-background.ts"

// 中身は見ないので、base64 として読める短い文字列で足りる（実物の画像は使わない）。
const IMAGE_BASE64 = "iVBORw0KGgo="

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

describe("toBackgroundVeil", () => {
  it("帯の中の数はそのまま", () => {
    expect(toBackgroundVeil(0.8)).toBe(0.8)
    expect(toBackgroundVeil(MIN_BACKGROUND_VEIL)).toBe(MIN_BACKGROUND_VEIL)
    expect(toBackgroundVeil(MAX_BACKGROUND_VEIL)).toBe(MAX_BACKGROUND_VEIL)
  })

  it("下限を下回る値は引き上げ、上限を超える値は上限へ寄せる", () => {
    expect(toBackgroundVeil(0.2)).toBe(MIN_BACKGROUND_VEIL)
    expect(toBackgroundVeil(0)).toBe(MIN_BACKGROUND_VEIL)
    expect(toBackgroundVeil(-1)).toBe(MIN_BACKGROUND_VEIL)
    expect(toBackgroundVeil(3)).toBe(MAX_BACKGROUND_VEIL)
  })

  it("数でない値・有限でない値は既定に落ちる", () => {
    expect(toBackgroundVeil("0.8")).toBe(DEFAULT_BACKGROUND_VEIL)
    expect(toBackgroundVeil(undefined)).toBe(DEFAULT_BACKGROUND_VEIL)
    expect(toBackgroundVeil(null)).toBe(DEFAULT_BACKGROUND_VEIL)
    expect(toBackgroundVeil(Number.NaN)).toBe(DEFAULT_BACKGROUND_VEIL)
    expect(toBackgroundVeil(Number.POSITIVE_INFINITY)).toBe(DEFAULT_BACKGROUND_VEIL)
  })
})

describe("isBackgroundFileName", () => {
  it("受け付けるのは .png / .jpg / .jpeg / .webp だけ", () => {
    expect(isBackgroundFileName("background.png")).toBe(true)
    expect(isBackgroundFileName("forest.JPG")).toBe(true)
    expect(isBackgroundFileName("room.jpeg")).toBe(true)
    expect(isBackgroundFileName("room.webp")).toBe(true)
    expect(isBackgroundFileName("motion.gif")).toBe(false)
    expect(isBackgroundFileName("vector.svg")).toBe(false)
    expect(isBackgroundFileName("background")).toBe(false)
  })

  it("パスの区切り・空白・引用符が入った名前は通さない", () => {
    expect(isBackgroundFileName("../background.png")).toBe(false)
    expect(isBackgroundFileName("sub/background.png")).toBe(false)
    expect(isBackgroundFileName("back ground.png")).toBe(false)
    expect(isBackgroundFileName('back").png')).toBe(false)
    expect(isBackgroundFileName("")).toBe(false)
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
