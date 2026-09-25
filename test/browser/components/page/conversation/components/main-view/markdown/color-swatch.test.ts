import { describe, expect, it } from "bun:test"

import {
  colorSwatch,
  type ResolvedColor,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/markdown/color-swatch.ts"

// トークンを実効の色へ解決するのはブラウザ（`readColorToken`）で、happy-dom は `var()` を
// 解決しない。ここでは解決済みの色を返す読み口を差して、判定だけを見る。
const SURFACE = { r: 0x22 / 255, g: 0x1f / 255, b: 0x2b / 255, alpha: 1 } satisfies ResolvedColor
const TOKENS = new Map<string, ResolvedColor>([
  ["surface", SURFACE],
  ["state-memo", { r: 0xbc / 255, g: 0xa0 / 255, b: 0xec / 255, alpha: 1 }],
  // ink を 6割の不透明度で持つ（`--ink-quiet` と同じ形）。
  ["ink-quiet", { r: 0xe8 / 255, g: 0xe3 / 255, b: 0xea / 255, alpha: 0.6 }],
])
const readToken = (name: string): ResolvedColor | undefined => TOKENS.get(name)

describe("colorSwatch", () => {
  it("色のトークン名は `--` や `var()` の有無にかかわらず `var(--…)` の地になる", () => {
    const backgrounds = ["state-memo", "--state-memo", "var(--state-memo)"].map(
      (text) => colorSwatch(text, readToken)?.background,
    )

    expect(backgrounds).toEqual(["var(--state-memo)", "var(--state-memo)", "var(--state-memo)"])
  })

  it("透ける色は surface に重ねた明るさで字を選ぶ", () => {
    expect(colorSwatch("ink-quiet", readToken)?.ink).toBe("dark")
  })

  it("読めないトークン（無い・色でない）は地にしない", () => {
    expect(colorSwatch("font-body", readToken)).toBeUndefined()
  })

  it("カラーコードは3桁・8桁（透ける色）も読んで地になる", () => {
    expect(colorSwatch("#fff", readToken)).toEqual({ background: "#fff", ink: "dark" })
    expect(colorSwatch("#00000080", readToken)).toEqual({ background: "#00000080", ink: "light" })
  })
})
