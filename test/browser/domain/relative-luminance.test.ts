import { describe, expect, it } from "vitest"

import { relativeLuminance } from "../../../src/browser/domain/relative-luminance.ts"

describe("relativeLuminance", () => {
  it("黒は 0、白は 1", () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(relativeLuminance(1, 1, 1)).toBeCloseTo(1, 10)
  })

  it("単色は係数そのもの", () => {
    expect(relativeLuminance(1, 0, 0)).toBeCloseTo(0.2126, 10)
    expect(relativeLuminance(0, 1, 0)).toBeCloseTo(0.7152, 10)
    expect(relativeLuminance(0, 0, 1)).toBeCloseTo(0.0722, 10)
  })

  it("#777777（各チャンネル 119/255）は約 0.1845", () => {
    const channel = 119 / 255
    expect(relativeLuminance(channel, channel, channel)).toBeCloseTo(0.1845, 3)
  })
})
