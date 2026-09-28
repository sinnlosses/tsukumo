import { describe, expect, it, vi } from "vitest"

import { createVisitClock } from "../../../../src/server/visit/adapter/visit-clock.ts"

describe("createVisitClock", () => {
  it("間を置いて1回起こし、取り消したものは起こさない", async () => {
    const clock = createVisitClock()
    const woken: string[] = []

    clock.after(5, () => woken.push("kept"))
    const cancel = clock.after(5, () => woken.push("cancelled"))
    cancel()

    await vi.waitFor(() => {
      expect(woken).toEqual(["kept"])
    })
  })
})
