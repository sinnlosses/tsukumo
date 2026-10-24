import { describe, expect, it } from "vitest"

import { imageSizeOf } from "../../../../src/server/report/core/image-size.ts"

// どれも形式の頭だけを手で組んだ架空のバイト列（実物の画像は使わない）。

function bytes(...parts: readonly (readonly number[] | string)[]): Uint8Array {
  return new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : [...part],
    ),
  )
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe("imageSizeOf", () => {
  it("PNG は IHDR の幅と高さを読む", () => {
    const png = bytes(PNG_SIGNATURE, [0, 0, 0, 13], "IHDR", [0, 0, 0x01, 0x40, 0, 0, 0, 0xb4])

    expect(imageSizeOf("image/png", png)).toEqual({ kind: "measured", width: 320, height: 180 })
  })

  it("GIF は論理画面の幅と高さを小さい桁から読む", () => {
    const gif = bytes("GIF89a", [0x40, 0x01, 0xb4, 0x00])

    expect(imageSizeOf("image/gif", gif)).toEqual({ kind: "measured", width: 320, height: 180 })
  })

  it("JPEG は SOF の手前の区切りを飛ばし、SOF の幅と高さを読む", () => {
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00],
      [0xff, 0xc4, 0x00, 0x04, 0x00, 0x00],
      [0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xb4, 0x01, 0x40],
    )

    expect(imageSizeOf("image/jpeg", jpeg)).toEqual({ kind: "measured", width: 320, height: 180 })
  })

  it("WebP は VP8・VP8L・VP8X のそれぞれの位置から読む", () => {
    const riff = (chunk: string, body: readonly number[]): Uint8Array =>
      bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk, body)

    const lossy = riff("VP8 ", [...Array.from({ length: 10 }, () => 0), 0x40, 0x01, 0xb4, 0x00])
    // 幅-1 と 高さ-1 を 14 ビットずつ詰めた値（319 | 179 << 14）。
    const lossless = riff("VP8L", [0, 0, 0, 0, 0x2f, 0x3f, 0xc1, 0x2c, 0x00, 0, 0, 0, 0, 0])
    const extended = riff("VP8X", [0, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x01, 0x00, 0xb3, 0x00, 0x00])

    expect(imageSizeOf("image/webp", lossy)).toEqual({ kind: "measured", width: 320, height: 180 })
    expect(imageSizeOf("image/webp", lossless)).toEqual({
      kind: "measured",
      width: 320,
      height: 180,
    })
    expect(imageSizeOf("image/webp", extended)).toEqual({
      kind: "measured",
      width: 320,
      height: 180,
    })
  })

  it("頭が途中で切れている・寸法が 0 の画像は読めない", () => {
    expect(imageSizeOf("image/png", bytes(PNG_SIGNATURE))).toEqual({ kind: "unmeasured" })
    expect(imageSizeOf("image/gif", bytes("GIF89a", [0, 0, 0xb4, 0]))).toEqual({
      kind: "unmeasured",
    })
    expect(imageSizeOf("image/jpeg", bytes([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toEqual({
      kind: "unmeasured",
    })
  })
})
