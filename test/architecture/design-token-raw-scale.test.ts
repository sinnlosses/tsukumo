import { describe, expect, it } from "vitest"

import { rawScaleReferenceCount, totalByBrowserCss } from "./design-token-declaration.ts"

describe("design-token-raw-scale", () => {
  it("部品の CSS 全体が生の --space-* を引く宣言の合計が、上限と一致する", () => {
    const actual = totalByBrowserCss(rawScaleReferenceCount)

    expect(
      actual,
      `生の --space-* の参照が増えた（実数 ${actual}・上限 ${RAW_SCALE_REFERENCE_LIMIT}）。意味のトークン（--inset-*・--stack-*・--inline-*・--gutter-*）を使う`,
    ).toBeLessThanOrEqual(RAW_SCALE_REFERENCE_LIMIT)
    expect(
      actual,
      `生の --space-* の参照が減った（実数 ${actual}・上限 ${RAW_SCALE_REFERENCE_LIMIT}）。RAW_SCALE_REFERENCE_LIMIT を実数まで下げる`,
    ).toBeGreaterThanOrEqual(RAW_SCALE_REFERENCE_LIMIT)
  })
})

/** 部品の CSS 全体が生の `--space-*` を引く宣言の上限。意味のトークンへ寄せて減らす向きにだけ動かす。 */
const RAW_SCALE_REFERENCE_LIMIT = 794
