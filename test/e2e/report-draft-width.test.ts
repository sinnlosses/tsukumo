import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"

// 草稿の紙と最終レポートの紙は同じ幅であること。
// 幅は CSS だけで決まり、単体テストは class しか見ないので、実ブラウザで測る。

/** 副画素の丸め（1px まで）。 */
const TOLERANCE_PX = 1

const DRAFT = '[aria-label="書きかけのレポート"]'
const PAPER = 'section[class*="main-step"]'

async function draftWidth(page: Page): Promise<number> {
  await page.locator(DRAFT).waitFor()
  return page.locator(DRAFT).evaluate((element) => element.getBoundingClientRect().width)
}

async function finalWidth(page: Page): Promise<number> {
  await page.locator(DRAFT).waitFor({ state: "detached" })
  await expect(page.locator(PAPER)).toBeVisible()
  return page.locator(PAPER).evaluate((element) => element.getBoundingClientRect().width)
}

test.describe("草稿と確定版の紙の幅", () => {
  test("wide の画面で、草稿の紙と最終レポートの紙の幅が等しい", async ({ run }) => {
    const room = await run.open({
      scenario: "report-draft-width",
      scene: "report-draft-held",
      viewport: "wide",
      domRoots: [],
    })
    await room.waitForEvent("tool-finished")
    const drafted = await draftWidth(room.page)
    await room.waitForEvent("turn-finished")
    const finished = await finalWidth(room.page)
    expect(Math.abs(finished - drafted)).toBeLessThanOrEqual(TOLERANCE_PX)
  })
})
