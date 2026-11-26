import { describe, expect, it } from "vitest"

import { marginDeclarationCount, totalByBrowserCss } from "./design-token-declaration.ts"

describe("design-token-margin", () => {
  it("部品の CSS 全体が 0 でない margin を宣言する合計が、上限と一致する", () => {
    const actual = totalByBrowserCss(marginDeclarationCount)

    expect(
      actual,
      `margin の宣言が増えた（実数 ${actual}・上限 ${MARGIN_DECLARATION_LIMIT}）。部品が外の余白を持たない。親の gap で間を決める`,
    ).toBeLessThanOrEqual(MARGIN_DECLARATION_LIMIT)
    expect(
      actual,
      `margin の宣言が減った（実数 ${actual}・上限 ${MARGIN_DECLARATION_LIMIT}）。MARGIN_DECLARATION_LIMIT を実数まで下げる`,
    ).toBeGreaterThanOrEqual(MARGIN_DECLARATION_LIMIT)
  })
})

describe("marginDeclarationCount", () => {
  it.each([
    "margin: 0 0 var(--space-sm)",
    "margin-top: auto",
    "margin: calc(-1 * var(--space-2xs))",
    "margin-inline: auto",
  ])("数える: %s", (declaration) => {
    expect(marginDeclarationCount(`.a { ${declaration}; }`)).toBe(1)
  })

  it.each(["margin: 0", "margin-top: 0", "padding: var(--space-sm)"])(
    "数えない: %s",
    (declaration) => {
      expect(marginDeclarationCount(`.a { ${declaration}; }`)).toBe(0)
    },
  )

  it("コメントの中の宣言は数えない", () => {
    expect(marginDeclarationCount("/* margin-top: auto; */ .a { color: red; }")).toBe(0)
  })
})

/** 部品の CSS 全体が 0 でない margin を宣言する数の上限。親の gap へ替えて減らす向きにだけ動かす。 */
const MARGIN_DECLARATION_LIMIT = 282
