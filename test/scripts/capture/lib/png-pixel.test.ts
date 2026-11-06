import { PNG } from "pngjs"
import { describe, expect, test } from "vitest"

import { decodePng } from "../../../../scripts/capture/lib/png-pixel.ts"
import { fictionalPng } from "../../../../scripts/shared/fictional-png.ts"

describe("decodePng", () => {
  test("RGB の PNG を RGBA に戻す（alpha は 255）", () => {
    const png = decodePng(fictionalPng(2, 1, [10, 20, 30]))
    expect(png.width).toBe(2)
    expect(png.height).toBe(1)
    expect([...png.pixels]).toStrictEqual([10, 20, 30, 255, 10, 20, 30, 255])
  })

  test("RGBA の PNG を元の画素に戻す", () => {
    const source = new PNG({ width: 2, height: 1 })
    source.data.set([1, 2, 3, 4, 200, 201, 202, 203])
    const png = decodePng(PNG.sync.write(source))
    expect([...png.pixels]).toStrictEqual([1, 2, 3, 4, 200, 201, 202, 203])
  })

  test("PNG でないものは throw する", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(Error)
  })
})
