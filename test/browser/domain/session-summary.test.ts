import { describe, expect, it } from "vitest"

import { remainingOf } from "../../../src/browser/domain/session-summary.ts"

describe("要約の残りの段落", () => {
  it("「残り：」で始まる段落の中身を、書き出しを外して返す", () => {
    expect(remainingOf("架空の作業をした。\n\n残り：架空の検証が1件。")).toBe("架空の検証が1件。")
  })

  it("半角のコロンも書き出しとして外す", () => {
    expect(remainingOf("残り: 架空の検証")).toBe("架空の検証")
  })

  it("残りの段落が無い・中身が空なら undefined", () => {
    expect(remainingOf("架空の作業をした。")).toBeUndefined()
    expect(remainingOf("残り：")).toBeUndefined()
  })
})
