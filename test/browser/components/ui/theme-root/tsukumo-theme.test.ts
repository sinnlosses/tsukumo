import { readFileSync } from "node:fs"
import { isDeepStrictEqual } from "node:util"

import { neutralTheme } from "@astryxdesign/theme-neutral"
import { describe, expect, it } from "vitest"

import { tsukumoComponentOverride } from "../../../../../src/browser/components/ui/theme-root/tsukumo-component-override.ts"
import { tsukumoTheme } from "../../../../../src/browser/components/ui/theme-root/tsukumo-theme.ts"

const THEME_CSS = readFileSync(`${process.cwd()}/src/browser/styles/theme.css`, "utf8")

const DECLARED_TOKENS = new Set(
  [...THEME_CSS.matchAll(/^\s*(--[a-z0-9-]+):/gm)].flatMap((match) => match[1] ?? []),
)

const REFERENCE = /var\((--[a-z0-9-]+)\)/g

/** neutral から継いだ分を除いた、tsukumo の定義の tokens と、adaptations の規則。 */
function ownDefinition(): {
  readonly tokens: Readonly<Record<string, unknown>>
  readonly adaptations: { readonly rules: readonly unknown[] }
} {
  const { __inputTokens: baseTokens = {}, __adaptations: baseAdaptations } = neutralTheme
  const { __inputTokens: tokens = {}, __adaptations: adaptations } = tsukumoTheme
  return {
    tokens: Object.fromEntries(
      Object.entries(tokens).filter(([name, value]) => !isDeepStrictEqual(baseTokens[name], value)),
    ),
    adaptations: { rules: adaptations.rules.slice(baseAdaptations.rules.length) },
  }
}

/** 定義の `tokens` の値を、`adaptations` の規則の中まで再帰で集める。 */
function tokenValuesIn(node: unknown): readonly unknown[] {
  if (Array.isArray(node)) {
    return node.flatMap(tokenValuesIn)
  }
  if (typeof node !== "object" || node === null) {
    return []
  }
  return Object.entries(node).flatMap(([key, child]) =>
    key === "tokens" && typeof child === "object" && child !== null
      ? Object.values(child).flat()
      : tokenValuesIn(child),
  )
}

function overrideValues(node: unknown): readonly unknown[] {
  if (typeof node !== "object" || node === null) {
    return [node]
  }
  return Object.values(node).flatMap(overrideValues)
}

/** tsukumo のトークンの `var()` と、それを組む `color-mix()`・`inset`・割合だけでできていない値。 */
function foreignValues(definition: unknown): readonly string[] {
  return foreignAmong(tokenValuesIn(definition))
}

function foreignAmong(values: readonly unknown[]): readonly string[] {
  return values.map(String).filter((value) => {
    const names = [...value.matchAll(REFERENCE)].map((match) => match[1] ?? "")
    const rest = value
      .replaceAll(REFERENCE, "")
      .replaceAll(/\b(?:color-mix|in|srgb|transparent|inset)\b/g, "")
    return !names.every((name) => DECLARED_TOKENS.has(name)) || !/^[\s,()\d.%]*$/.test(rest)
  })
}

describe("tsukumo のテーマの定義", () => {
  it("値は theme.css が宣言したトークンの var() と、それを組んだ式だけでできている", () => {
    const definition = ownDefinition()

    expect(Object.keys(definition.tokens)).not.toEqual([])
    expect(definition.adaptations.rules).not.toEqual([])
    expect(foreignValues(definition)).toEqual([])
  })

  it("components の上書きの値も、theme.css が宣言したトークンの var() だけでできている", () => {
    expect(overrideValues(tsukumoComponentOverride)).not.toEqual([])
    expect(foreignAmong(overrideValues(tsukumoComponentOverride))).toEqual([])
    expect(
      foreignAmong(overrideValues({ text: { "color:x": { color: "var(--no-such-token)" } } })),
    ).toEqual(["var(--no-such-token)"])
    expect(foreignAmong(overrideValues({ text: { "color:x": { color: "#f00" } } }))).toEqual([
      "#f00",
    ])
  })

  it("写すのは色・コードの書体・本文の行の高さだけで、字の段・本文の書体・余白・角丸・影は Astryx の値のまま", () => {
    const { tokens, adaptations } = ownDefinition()
    const mirrored = /^--(?:color-|shadow-inset-)|^--font-family-code$|^--text-body-leading$/

    expect(Object.keys(tokens).filter((name) => !mirrored.test(name))).toEqual([])
    expect(tokenValuesIn(adaptations)).toEqual(["var(--line-height-reading)"])
  })

  it("16 進の色・長さの数・宣言の無いトークンを書いた値は、tokens でも adaptations の中でも拾う", () => {
    expect(foreignValues({ tokens: { "--color-accent": "#ff0000" } })).toEqual(["#ff0000"])
    expect(foreignValues({ tokens: { "--spacing-1": "4px" } })).toEqual(["4px"])
    expect(foreignValues({ tokens: { "--color-accent": "var(--no-such-token)" } })).toEqual([
      "var(--no-such-token)",
    ])
    expect(
      foreignValues({
        adaptations: {
          rules: [{ when: { pointer: "coarse" }, value: { tokens: { "--color-accent": "#fff" } } }],
        },
      }),
    ).toEqual(["#fff"])
  })
})
