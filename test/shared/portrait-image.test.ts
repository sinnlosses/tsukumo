import { describe, expect, it } from "bun:test"

import {
  MAX_PORTRAIT_BYTES,
  MAX_PORTRAIT_DATA_URL_LENGTH,
  parsePortraitImage,
  portraitFileName,
} from "../../src/shared/portrait-image.ts"

// 素材は手で書いた架空の1〜数バイト（実物の立ち絵は使わない）。
const PNG_BASE64 = "AAAA"

/** デコード後 `bytes` バイトになる base64 の文字列（中身は 0 の並び）。 */
function base64OfBytes(bytes: number): string {
  return "A".repeat(Math.ceil(bytes / 3) * 4)
}

describe("parsePortraitImage", () => {
  it("svg / png / gif の data URL を形式と base64 に分ける", () => {
    expect(parsePortraitImage(`data:image/svg+xml;base64,${PNG_BASE64}`)).toEqual({
      format: "svg",
      base64: PNG_BASE64,
    })
    expect(parsePortraitImage(`data:image/png;base64,${PNG_BASE64}`)?.format).toBe("png")
    expect(parsePortraitImage(`data:image/gif;base64,${PNG_BASE64}`)?.format).toBe("gif")
  })

  it("受け付けない種類（jpeg / webp / 画像でないもの）は undefined", () => {
    expect(parsePortraitImage(`data:image/jpeg;base64,${PNG_BASE64}`)).toBeUndefined()
    expect(parsePortraitImage(`data:image/webp;base64,${PNG_BASE64}`)).toBeUndefined()
    expect(parsePortraitImage(`data:text/html;base64,${PNG_BASE64}`)).toBeUndefined()
  })

  it("data URL でない・base64 でない形は undefined", () => {
    expect(parsePortraitImage("https://example.com/portrait.png")).toBeUndefined()
    expect(parsePortraitImage("data:image/png,AAAA")).toBeUndefined()
    expect(parsePortraitImage("data:image/png;base64,あ")).toBeUndefined()
    expect(parsePortraitImage("")).toBeUndefined()
  })

  it("デコード後の大きさが上限までなら受け取り、超えたら undefined", () => {
    const withinLimit = `data:image/png;base64,${base64OfBytes(MAX_PORTRAIT_BYTES - 3)}`
    const overLimit = `data:image/png;base64,${base64OfBytes(MAX_PORTRAIT_BYTES + 3)}`

    expect(parsePortraitImage(withinLimit)).toBeDefined()
    expect(parsePortraitImage(overLimit)).toBeUndefined()
  })

  it("文字列の上限はデコード後の上限から決まる（先に長さで切れる）", () => {
    expect(MAX_PORTRAIT_DATA_URL_LENGTH).toBeGreaterThan(Math.ceil(MAX_PORTRAIT_BYTES / 3) * 4)
  })
})

describe("portraitFileName", () => {
  it("表情と形式から組み立てる（外から届いた名前を使わない）", () => {
    expect(portraitFileName("default", "svg")).toBe("default.svg")
    expect(portraitFileName("flustered", "gif")).toBe("flustered.gif")
  })
})
