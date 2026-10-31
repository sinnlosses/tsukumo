import { expect, test } from "./tsukumo-fixture.ts"

const MAIN_REGION_SELECTOR = '[data-region="main"]'
const CHECKS_SELECTOR = `${MAIN_REGION_SELECTOR} [role="table"][aria-label^="検証結果"]`
const REVEALING_SELECTOR = "[data-revealing]"
const REVEAL_TIMEOUT_MS = 20_000

test.use({ scene: "a2ui-reveal-sample", reducedMotion: "no-preference" })

test("演出が終わると `data-revealing` が消え、本文の領域が基準画像と一致する", async ({
  page,
  viewUrl,
}) => {
  test.setTimeout(60_000)
  await page.goto(viewUrl, { waitUntil: "domcontentloaded" })
  await expect(page.locator(REVEALING_SELECTOR)).toBeAttached({ timeout: REVEAL_TIMEOUT_MS })
  await expect(page.locator(CHECKS_SELECTOR)).toBeAttached()
  await expect(page.locator(REVEALING_SELECTOR)).toHaveCount(0, { timeout: REVEAL_TIMEOUT_MS })
  await expect(page.locator(MAIN_REGION_SELECTOR)).toHaveScreenshot("report-checks.png")
})

test("`Escape` で演出を打ち切ると `data-revealing` がすぐ消える", async ({ page, viewUrl }) => {
  test.setTimeout(60_000)
  await page.goto(viewUrl, { waitUntil: "domcontentloaded" })
  await expect(page.locator(REVEALING_SELECTOR)).toBeAttached({ timeout: REVEAL_TIMEOUT_MS })
  await page.keyboard.press("Escape")
  await expect(page.locator(REVEALING_SELECTOR)).toHaveCount(0, { timeout: 1000 })
  await expect(page.locator(MAIN_REGION_SELECTOR)).toHaveScreenshot("report-checks-skipped.png")
})

test("`page.clock` で時計を進めると演出が終わる", async ({ page, viewUrl }) => {
  test.setTimeout(60_000)
  await page.clock.install()
  await page.goto(viewUrl, { waitUntil: "domcontentloaded" })
  await expect(page.locator(REVEALING_SELECTOR)).toBeAttached({ timeout: REVEAL_TIMEOUT_MS })
  const now = await page.evaluate(() => Temporal.Now.instant().epochMilliseconds)
  await page.clock.pauseAt(now + 10)
  await page.clock.runFor(30_000)
  await expect(page.locator(REVEALING_SELECTOR)).toHaveCount(0, { timeout: 5000 })
})
