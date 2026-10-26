import { describe, expect, it } from "vitest"

import {
  isTemporalSupported,
  showUnsupportedBrowserNotice,
} from "../../../src/browser/utils/check-temporal-support.ts"

describe("isTemporalSupported", () => {
  it("Temporal を持つ環境を通す", () => {
    expect(isTemporalSupported({ Temporal: {} })).toBe(true)
  })

  it("Temporal を持たない環境（Safari など）を通さない", () => {
    expect(isTemporalSupported({})).toBe(false)
  })
})

describe("showUnsupportedBrowserNotice", () => {
  it("root の中身を案内の1文だけにする", () => {
    const root = document.createElement("div")
    root.append(document.createElement("span"))

    showUnsupportedBrowserNotice(root)

    expect(root.children).toHaveLength(1)
    expect(root.textContent).toBe(
      "このブラウザでは動きません。Chromium 系か Firefox 139 以降で開いてください。",
    )
    expect(root.querySelector("[role='alert']")).not.toBeNull()
  })
})
