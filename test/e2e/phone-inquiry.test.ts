import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"

// 狭い画面（760px 以下）の答え待ち。札は入力欄の場所に、入力欄のすぐ上に出る。
// 位置と横・縦に転がらないこと、札の中で選んで答えられることを実ブラウザで確かめる。期待値は撮らない。

function cardOf(page: Page) {
  return page.getByRole("region", { name: "お伺い" })
}

test.describe("狭い画面の答え待ち", () => {
  test("390x844 で、札は入力欄の場所に出て、紙をスクロールしても動かず、ページは横にも縦にもスクロールしない", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "phone-inquiry-fixed",
      scene: "phone-inquiry-pick",
      viewport: "phone",
      domRoots: [],
    })
    const { page } = room
    const card = cardOf(page)
    await card.waitFor()

    expect(await card.evaluate((element) => element.closest('[data-region="dock"]') !== null)).toBe(
      true,
    )
    const before = await card.boundingBox()
    // 紙を転がるほど長くして、いちばん下まで転がす。
    const scrolled = await page.evaluate(() => {
      const paper = document.querySelector('[data-region="paper"]')
      if (!(paper instanceof HTMLElement)) {
        return -1
      }
      const spacer = document.createElement("div")
      spacer.style.height = "3000px"
      paper.appendChild(spacer)
      paper.scrollTop = 1000
      return paper.scrollTop
    })
    expect(scrolled).toBeGreaterThan(0)
    expect(await card.boundingBox()).toEqual(before)

    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }))
    expect(overflow).toEqual({ x: 0, y: 0 })
  })

  test("札の中で選んで「これで答える」で答えると札が消える", async ({ run }) => {
    const room = await run.open({
      scenario: "phone-inquiry-answer",
      scene: "phone-inquiry-pick",
      viewport: "phone",
      domRoots: [],
    })
    const { page } = room
    const card = cardOf(page)
    await card.getByRole("radio", { name: /1件ずつ確かめる/ }).click()
    await card.getByRole("button", { name: /これで答える/ }).click()

    await room.waitForEvent("pending-changed", 2)
    await expect.poll(() => cardOf(page).count()).toBe(0)
  })
})
