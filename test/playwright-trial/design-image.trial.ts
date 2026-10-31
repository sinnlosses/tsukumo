import { REPORT_COMPONENT_SCHEMAS } from "../../src/shared/report/a2ui-report-catalog.ts"
import { expect, test } from "./tsukumo-fixture.ts"

const PART_COUNT = Object.keys(REPORT_COMPONENT_SCHEMAS).length

test("`#design` の見た目が基準画像と一致する", async ({ page, viewUrl }) => {
  await page.goto(`${viewUrl}#design`, { waitUntil: "domcontentloaded" })
  await expect(page.locator("[data-catalog-part] [data-report-body]")).toHaveCount(PART_COUNT)
  await expect(page.locator("[data-catalog-part] [aria-busy]")).toHaveCount(0)

  await expect(page).toHaveScreenshot("design.png", {
    clip: { x: 0, y: 56, width: 1440, height: 844 },
  })
})
