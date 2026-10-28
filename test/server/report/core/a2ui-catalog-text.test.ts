import { describe, expect, it } from "vitest"

import { reportCatalogText } from "../../../../src/server/report/core/a2ui-catalog-text.ts"

describe("reportCatalogText", () => {
  it("catalogId と components を持つ JSON の文字列を返す", () => {
    const parsed: unknown = JSON.parse(reportCatalogText())

    expect(parsed).toMatchObject({ catalogId: expect.any(String), components: { Report: {} } })
  })
})
