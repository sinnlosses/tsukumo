import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { THEME_TOKEN_NAMES } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/theme-token-names.ts"

describe("THEME_TOKEN_NAMES", () => {
  it("theme.css に定義のあるトークンの名前と過不足なく一致する", () => {
    const css = readFileSync(
      new URL("../../../../../../../../src/browser/styles/theme.css", import.meta.url),
      "utf8",
    )
    const defined = [...css.matchAll(/^\s*--([a-zA-Z0-9-]+):/gm)].map((match) => match[1])

    expect([...THEME_TOKEN_NAMES].toSorted()).toEqual([...new Set(defined)].toSorted())
  })
})
