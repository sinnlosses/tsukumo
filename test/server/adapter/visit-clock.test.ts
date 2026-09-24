import { describe, expect, it } from "bun:test"

import { createVisitClock } from "../../../src/server/adapter/visit-clock.ts"

describe("createVisitClock", () => {
  it("間を置いて1回起こし、取り消したものは起こさない", async () => {
    const clock = createVisitClock()
    const woken: string[] = []

    clock.after(5, () => woken.push("kept"))
    const cancel = clock.after(5, () => woken.push("cancelled"))
    cancel()
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(woken).toEqual(["kept"])
  })
})
