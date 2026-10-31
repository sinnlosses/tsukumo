import { crc32, deflateSync } from "node:zlib"

import { describe, expect, test } from "vitest"

import { describeStillDiff } from "../../../../scripts/capture/lib/still-diff.ts"

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, "latin1")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

/** 全面が白で、指定した画素だけ黒の RGBA の PNG（フィルタ 0）。 */
function png(width: number, height: number, black: readonly (readonly [number, number])[]): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height, 255)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
  }
  for (const [x, y] of black) {
    const at = y * (stride + 1) + 1 + x * 4
    raw[at] = 0
    raw[at + 1] = 0
    raw[at + 2] = 0
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ])
}

describe("describeStillDiff", () => {
  test("違った画素の数と、囲む箱を言う", () => {
    const message = describeStillDiff(
      png(10, 8, [[1, 2]]),
      png(10, 8, [
        [1, 2],
        [4, 6],
        [3, 5],
      ]),
    )

    expect(message).toBe("2 画素が違う（x 3-4、y 5-6、領域 10x8）")
  })

  test("大きさが違えば、大きさの違いを言う", () => {
    expect(describeStillDiff(png(10, 8, []), png(10, 9, []))).toBe("大きさが違う（10x8 → 10x9）")
  })

  test("画素が同じなら、そう言う", () => {
    expect(describeStillDiff(png(4, 4, []), png(4, 4, []))).toBe("画素は同じでバイトだけ違う")
  })
})
