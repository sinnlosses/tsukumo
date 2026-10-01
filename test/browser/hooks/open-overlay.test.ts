import { describe, expect, it } from "vitest"

import { acquireOverlay, isOverlayOpen } from "../../../src/browser/hooks/open-overlay.ts"

describe("open-overlay", () => {
  it("開いている面が1つでもあるあいだは true、全部解くと false", () => {
    expect(isOverlayOpen()).toBe(false)
    const releaseFirst = acquireOverlay()
    const releaseSecond = acquireOverlay()
    releaseFirst()
    expect(isOverlayOpen()).toBe(true)
    releaseSecond()
    expect(isOverlayOpen()).toBe(false)
  })
})
