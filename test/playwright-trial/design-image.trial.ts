import type { Page } from "@playwright/test"

import { REPORT_COMPONENT_SCHEMAS } from "../../src/shared/report/a2ui-report-catalog.ts"
import { expect, test } from "./tsukumo-fixture.ts"

const PART_COUNT = Object.keys(REPORT_COMPONENT_SCHEMAS).length
const SETTLE_TIMEOUT_MS = 8000
const STILL_POLLS = 5
const POLL_INTERVAL_MS = 100

test("`#design` の全面が基準画像と一致する", async ({ page, viewUrl }) => {
  test.setTimeout(60_000)
  // Chart.js の伸びはアニメーション API に載らないので、読み込まれた瞬間に切る
  await page.addInitScript(() => {
    let chart: unknown
    Object.defineProperty(window, "Chart", {
      configurable: true,
      get: () => chart,
      set: (value: { defaults: { animation: unknown } }) => {
        value.defaults.animation = false
        chart = value
      },
    })
    new MutationObserver(() => {
      if (document.querySelector("[data-work-state='running']") !== null) {
        document.documentElement.dataset["sawRunning"] = "yes"
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-work-state"],
    })
  })

  await page.goto(`${viewUrl}#design`, { waitUntil: "domcontentloaded" })
  await expect(page.locator("[data-catalog-part] [data-report-body]")).toHaveCount(PART_COUNT)
  await expect(page.locator("[data-catalog-part] [aria-busy]")).toHaveCount(0)

  // 接続前の idle を拾わないよう、running を一度経てから idle になるのを待つ
  await expect(page.locator("html[data-saw-running]")).toBeAttached({ timeout: SETTLE_TIMEOUT_MS })
  await expect(page.locator("[data-work-state='idle']")).toBeAttached({
    timeout: SETTLE_TIMEOUT_MS,
  })
  await waitForStillHeight(page)

  await expect(page).toHaveScreenshot("design.png", { fullPage: true, timeout: 20_000 })
})

async function waitForStillHeight(page: Page): Promise<void> {
  let height = -1
  let stillPolls = 0
  while (stillPolls < STILL_POLLS) {
    const now = await page.evaluate(() => document.documentElement.scrollHeight)
    stillPolls = now === height ? stillPolls + 1 : 0
    height = now
    await page.waitForTimeout(POLL_INTERVAL_MS)
  }
}
