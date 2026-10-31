import { REPORT_COMPONENT_SCHEMAS } from "../../src/shared/report/a2ui-report-catalog.ts"
import { expect, test } from "./tsukumo-fixture.ts"

const PART_COUNT = Object.keys(REPORT_COMPONENT_SCHEMAS).length

test("`#design` を開くとカタログの全部品が本文として並び、読み込み中の器が残らない", async ({
  page,
  viewUrl,
}) => {
  await page.goto(`${viewUrl}#design`, { waitUntil: "domcontentloaded" })

  await expect(page.locator("[data-catalog-part]")).toHaveCount(PART_COUNT)
  await expect(page.locator("[data-catalog-part] [aria-busy]")).toHaveCount(0)
  await expect(page.locator("[data-catalog-part] [data-report-body]")).toHaveCount(PART_COUNT)
})
