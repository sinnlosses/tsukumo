import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"

// 草稿が確定版に替わるとき、紙の上端が画面で動かないこと。
// 草稿のあいだだけ本文を下端へ寄せると、確定で紙が頭へ跳ねて見える（寸法は実ブラウザでしか確かめられない）。

/** 副画素の丸め（1px まで）。 */
const TOLERANCE_PX = 1

const DRAFT = '[aria-label="書きかけのレポート"]'
const PAPER = 'section[class*="main-step"]'

async function draftTop(page: Page): Promise<number> {
  await page.locator(DRAFT).waitFor()
  return page.locator(DRAFT).evaluate((element) => element.getBoundingClientRect().top)
}

async function finalTop(page: Page): Promise<number> {
  await page.locator(DRAFT).waitFor({ state: "detached" })
  await expect(page.locator(PAPER)).toBeVisible()
  return page.locator(PAPER).evaluate((element) => element.getBoundingClientRect().top)
}

test.describe("草稿から確定版への切り替え", () => {
  for (const viewport of ["wide", "narrow"] as const) {
    test(`${viewport} の画面で、紙の上端が草稿と確定版で動かない`, async ({ run }) => {
      const room = await run.open({
        scenario: "report-draft-position",
        scene: "report-draft-held",
        viewport,
        domRoots: [],
      })
      await room.waitForEvent("tool-finished")
      const drafted = await draftTop(room.page)
      await room.waitForEvent("turn-finished")
      const finished = await finalTop(room.page)
      expect(Math.abs(finished - drafted)).toBeLessThanOrEqual(TOLERANCE_PX)
    })
  }
})
