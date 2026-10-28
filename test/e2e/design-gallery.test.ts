import { describe, expect, it } from "vitest"

import { REPORT_COMPONENT_SCHEMAS } from "../../src/shared/report/a2ui-report-catalog.ts"
import { useScenarioRun } from "./scenario-run.ts"

// 見本帳（`#design`）を開くと、カタログの全部品が本文として並ぶこと
// （docs/architecture/testing.md「E2E のシナリオの一覧」）。期待値は撮らず DOM で判定する。

const run = useScenarioRun()

describe("見本帳", () => {
  it("`#design` を開くとカタログの全部品が本文として並び、読み込み中の器が残らない", async () => {
    const room = await run.open({
      scenario: "design-gallery",
      scene: "report-blocks",
      viewport: "wide",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    const { page } = room

    await page.evaluate(() => {
      window.location.hash = "#design"
    })

    const parts = page.locator("[data-catalog-part]")
    await parts.first().waitFor()
    expect(await parts.count()).toBe(Object.keys(REPORT_COMPONENT_SCHEMAS).length)
    await page.waitForFunction(
      () => document.querySelectorAll("[data-catalog-part] [aria-busy]").length === 0,
    )
    expect(await page.locator("[data-catalog-part] [data-report-body]").count()).toBe(
      Object.keys(REPORT_COMPONENT_SCHEMAS).length,
    )
  })
})
