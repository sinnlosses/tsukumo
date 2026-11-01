import { chromium } from "playwright-core"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { waitForRevealEnd } from "../../../../scripts/capture/lib/reveal-end.ts"

const REVEALING_HTML = "<div data-revealing></div>"

describe("waitForRevealEnd", () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>

  beforeAll(async () => {
    browser = await chromium.launch()
  })

  afterAll(async () => {
    await browser.close()
  })

  test("演出の印が消えたら待ちを終える", async () => {
    const page = await browser.newPage()
    await page.setContent(REVEALING_HTML)
    await page.evaluate(() => {
      setTimeout(() => {
        document.querySelector("[data-revealing]")?.remove()
      }, 200)
    })

    await waitForRevealEnd(page, 5000)

    expect(await page.locator("[data-revealing]").count()).toBe(0)
    await page.close()
  })

  test("上限までに消えなくても throw しない", async () => {
    const page = await browser.newPage()
    await page.setContent(REVEALING_HTML)

    await expect(waitForRevealEnd(page, 200)).resolves.toBeUndefined()

    expect(await page.locator("[data-revealing]").count()).toBe(1)
    await page.close()
  })
})
