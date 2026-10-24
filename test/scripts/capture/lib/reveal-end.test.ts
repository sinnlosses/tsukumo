import { describe, expect, test, vi } from "vitest"

import { waitForRevealEnd } from "../../../../scripts/capture/lib/reveal-end.ts"

describe("waitForRevealEnd", () => {
  test("演出の印が消えるのを待つ", async () => {
    const waitForSelector = vi.fn<() => Promise<null>>(() => Promise.resolve(null))

    await waitForRevealEnd({ waitForSelector }, 1234)

    expect(waitForSelector).toHaveBeenCalledWith("[data-revealing]", {
      state: "detached",
      timeout: 1234,
    })
  })

  test("上限までに消えなくても throw しない", async () => {
    const waitForSelector = vi.fn<() => Promise<null>>(() => Promise.reject(new Error("timeout")))

    await expect(waitForRevealEnd({ waitForSelector }, 10)).resolves.toBeUndefined()
  })
})
