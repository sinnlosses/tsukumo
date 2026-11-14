// 「舞台と紙」の字の段。`theme.css` の最初の `:root` の字の大きさが 13px を下回らず5種類以内で、本文の行送りが 1.8 であること。

import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { SRC_ROOT } from "./source-file.ts"

const ROOT_BLOCK = /^:root\s*\{([^}]*)\}/m

const FONT_SIZE_DECLARATION = /^\s*(--font-[a-z0-9-]+):\s*([0-9.]+)rem;/gm

const LINE_HEIGHT_DECLARATION = /^\s*--line-height-reading:\s*([0-9.]+);/m

const MIN_REM = 0.8125

const MAX_STEPS = 5

describe("字の段", () => {
  it("theme.css の字の大きさは 13px 以上で5種類以内、本文の行送りは 1.8", () => {
    const scale = typeScaleOf(readFileSync(`${SRC_ROOT}/browser/styles/theme.css`, "utf8"))

    expect(scale.sizes.length).toBeGreaterThan(0)
    expect(belowMinimum(scale)).toEqual([])
    expect(new Set(scale.sizes.map(([, rem]) => rem)).size).toBeLessThanOrEqual(MAX_STEPS)
    expect(scale.lineHeight).toBe(1.8)
  })

  it("読みは、最初の :root の段だけを拾い、13px 未満の字と段の数を見分ける", () => {
    const css = [
      ":root {",
      "  --font-label: 0.75rem;",
      "  --font-body: 1rem;",
      "  --line-height-reading: 1.85;",
      "}",
      "@media (max-width: 760px) {",
      "  :root {",
      "    --font-label: 0.5rem;",
      "  }",
      "}",
    ].join("\n")

    const scale = typeScaleOf(css)

    expect(belowMinimum(scale)).toEqual(["--font-label: 0.75rem"])
    expect(scale.sizes).toEqual([
      ["--font-label", 0.75],
      ["--font-body", 1],
    ])
    expect(scale.lineHeight).toBe(1.85)
  })
})

type TypeScale = {
  readonly sizes: readonly (readonly [string, number])[]
  readonly lineHeight: number
}

function typeScaleOf(css: string): TypeScale {
  const block = ROOT_BLOCK.exec(css)?.[1] ?? ""
  return {
    sizes: [...block.matchAll(FONT_SIZE_DECLARATION)].map(
      (match) => [match[1] ?? "", Number(match[2])] as const,
    ),
    lineHeight: Number(LINE_HEIGHT_DECLARATION.exec(block)?.[1]),
  }
}

function belowMinimum(scale: TypeScale): readonly string[] {
  return scale.sizes.filter(([, rem]) => rem < MIN_REM).map(([name, rem]) => `${name}: ${rem}rem`)
}
