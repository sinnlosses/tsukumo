import { describe, expect, it } from "vitest"

import config from "../../vitest.config.ts"

describe("単体テストの後始末", () => {
  it("vi.spyOn の差し替えを it のたびに戻す restoreMocks が設定で有効", () => {
    expect(config.test?.restoreMocks).toBe(true)
  })
})
