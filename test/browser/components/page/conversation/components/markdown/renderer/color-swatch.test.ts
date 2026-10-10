import { describe, expect, it, vi } from "vitest"

import {
  cachedColorTokenReader,
  colorSwatch,
  type ResolvedColor,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/color-swatch.ts"

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

describe("cachedColorTokenReader", () => {
  it("同じ名前は stamp が同じあいだ1回だけ読み、色でない名前（undefined）も覚える", () => {
    const read = vi.fn(readToken)
    const cached = cachedColorTokenReader(read, () => "a")

    const results = ["state-memo", "state-memo", "font-body", "font-body", "state-memo"].map(cached)

    expect(results.map((color) => color === undefined)).toEqual([false, false, true, true, false])
    expect(read.mock.calls).toEqual([["state-memo"], ["font-body"]])
  })

  it("stamp が変わったら覚えた色を捨てて読み直す", () => {
    let stamp = "a"
    let color: ResolvedColor | undefined = TOKENS.get("state-memo")
    const read = vi.fn(() => color)
    const cached = cachedColorTokenReader(read, () => stamp)

    expect(cached("state-memo")).toBe(color)
    stamp = "b"
    color = TOKENS.get("surface")

    expect(cached("state-memo")).toBe(color)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it("カラーコードの2回目以降も surface を読み直さない", () => {
    const read = vi.fn(readToken)
    const cached = cachedColorTokenReader(read, () => "a")

    colorSwatch("#fff", cached)
    colorSwatch("#000", cached)

    expect(read.mock.calls).toEqual([["surface"]])
  })
})
