import { describe, expect, test } from "vitest"

import type { CatalogEntry } from "../../../scripts/capture/lib/catalog-entry.ts"
import { indexHtml, type Shot } from "../../../scripts/capture/lib/catalog-index.ts"

function entryOf(name: string, label: string): CatalogEntry {
  return {
    name,
    scene: "report",
    label,
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: { kind: "scene-end" },
  }
}

const WIDE = { name: "wide", width: 1400, height: 900, fullPage: false } as const
const NARROW = { name: "narrow", width: 720, height: 900, fullPage: true } as const

function count(text: string, part: string): number {
  return text.split(part).length - 1
}

describe("indexHtml", () => {
  test("同じ件の広い窓と狭い窓は1つの節に画像2枚で並ぶ", () => {
    const entry = entryOf("a", "件A")
    const html = indexHtml([
      { entry, size: WIDE, file: "/out/a-wide.png" },
      { entry, size: NARROW, file: "/out/a-narrow.png" },
    ] satisfies readonly Shot[])
    expect(count(html, "<section")).toBe(1)
    expect(count(html, "<img")).toBe(2)
    expect(html).toContain('src="a-wide.png"')
    expect(html).toContain("720x900")
  })

  test("ラベルの記号はエスケープされる", () => {
    const html = indexHtml([{ entry: entryOf("a", "<b>&"), size: WIDE, file: "/out/a-wide.png" }])
    expect(html).toContain("&lt;b&gt;&amp;")
    expect(html).not.toContain("<b>")
  })

  test("撮った件が無ければ節は無い", () => {
    const html = indexHtml([])
    expect(count(html, "<section")).toBe(0)
    expect(html).toContain("<h1>")
  })
})
