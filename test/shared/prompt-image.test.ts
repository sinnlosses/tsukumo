import { describe, expect, it } from "bun:test"

import {
  isPromptImageMediaType,
  MAX_PROMPT_IMAGE_BYTES,
  MAX_PROMPT_IMAGE_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGE_THUMBNAIL_BYTES,
  MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGES,
  parsePromptImage,
  parsePromptImageThumbnail,
} from "../../src/shared/prompt-image.ts"

// 中身は見ないので、base64 として読める短い文字列で足りる（**実物の画像は使わない**。
// docs/coding-standards.md「会話内容の扱い」）。
const IMAGE_BASE64 = "iVBORw0KGgo="

/** 文字列の長さがちょうど `length` になる data URL（中身は読めるが、絵ではない）。 */
function dataUrlOfLength(length: number): string {
  const prefix = "data:image/png;base64,"
  const payloadLength = Math.floor((length - prefix.length) / 4) * 4
  return `${prefix}${"A".repeat(payloadLength)}`
}

describe("parsePromptImage", () => {
  it("受け付けるのは png / jpeg / gif / webp の4つ", () => {
    expect(parsePromptImage(`data:image/png;base64,${IMAGE_BASE64}`)).toEqual({
      mediaType: "image/png",
      base64: IMAGE_BASE64,
    })
    expect(parsePromptImage(`data:image/jpeg;base64,${IMAGE_BASE64}`)?.mediaType).toBe("image/jpeg")
    expect(parsePromptImage(`data:image/gif;base64,${IMAGE_BASE64}`)?.mediaType).toBe("image/gif")
    expect(parsePromptImage(`data:image/webp;base64,${IMAGE_BASE64}`)?.mediaType).toBe("image/webp")
  })

  it("形式外は undefined（`.svg` は API が取らないので、立ち絵と違って渡せない）", () => {
    expect(parsePromptImage(`data:image/svg+xml;base64,${IMAGE_BASE64}`)).toBeUndefined()
    expect(parsePromptImage(`data:image/bmp;base64,${IMAGE_BASE64}`)).toBeUndefined()
    expect(parsePromptImage(`data:text/plain;base64,${IMAGE_BASE64}`)).toBeUndefined()
    expect(parsePromptImage(`data:application/pdf;base64,${IMAGE_BASE64}`)).toBeUndefined()
  })

  it("data URL として読めない形は undefined", () => {
    expect(parsePromptImage("")).toBeUndefined()
    expect(parsePromptImage("架空の文字列")).toBeUndefined()
    expect(parsePromptImage("https://example.invalid/a.png")).toBeUndefined()
    // `;base64` の無い形（画面が作るのは `readAsDataURL` の形だけ）。
    expect(parsePromptImage("data:image/png,AAAA")).toBeUndefined()
  })

  it("上限（2 MiB）を超える大きさは undefined", () => {
    expect(parsePromptImage(dataUrlOfLength(MAX_PROMPT_IMAGE_DATA_URL_LENGTH))).toBeUndefined()
    expect(parsePromptImage(dataUrlOfLength(MAX_PROMPT_IMAGE_DATA_URL_LENGTH * 2))).toBeUndefined()
  })

  it("上限ちょうどの大きさは受け取る（境目で落とさない）", () => {
    // base64 の4文字＝3バイトなので、上限そのものになる長さから組む。
    const atLimit = `data:image/png;base64,${"A".repeat((MAX_PROMPT_IMAGE_BYTES / 3) * 4)}`

    expect(parsePromptImage(atLimit)?.mediaType).toBe("image/png")
  })
})

describe("parsePromptImageThumbnail", () => {
  it("形式の表は原寸と同じ", () => {
    expect(parsePromptImageThumbnail(`data:image/webp;base64,${IMAGE_BASE64}`)?.mediaType).toBe(
      "image/webp",
    )
    expect(parsePromptImageThumbnail(`data:image/svg+xml;base64,${IMAGE_BASE64}`)).toBeUndefined()
  })

  it("控えの上限は原寸よりずっと厳しい（記録に残り続けるのは控えだけ）", () => {
    expect(MAX_PROMPT_IMAGE_THUMBNAIL_BYTES).toBeLessThan(MAX_PROMPT_IMAGE_BYTES)

    // 原寸としては通るが、控えとしては大きすぎる長さ。
    const betweenLimits = dataUrlOfLength(MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH * 2)

    expect(parsePromptImage(betweenLimits)?.mediaType).toBe("image/png")
    expect(parsePromptImageThumbnail(betweenLimits)).toBeUndefined()
  })
})

describe("isPromptImageMediaType", () => {
  it("受け付ける4つだけが true（`File.type` の検査に使う）", () => {
    expect(isPromptImageMediaType("image/png")).toBe(true)
    expect(isPromptImageMediaType("image/jpeg")).toBe(true)
    expect(isPromptImageMediaType("image/gif")).toBe(true)
    expect(isPromptImageMediaType("image/webp")).toBe(true)
    expect(isPromptImageMediaType("image/svg+xml")).toBe(false)
    expect(isPromptImageMediaType("")).toBe(false)
  })
})

describe("上限の値", () => {
  it("1件の依頼に添えられるのは2枚", () => {
    expect(MAX_PROMPT_IMAGES).toBe(2)
  })

  it("1枚の上限は 5 MiB", () => {
    expect(MAX_PROMPT_IMAGE_BYTES).toBe(5 * 1024 * 1024)
  })
})
