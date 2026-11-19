import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"

// 歯車の「演出」の面の「動き」。「減らす」にすると OS の設定が無くても立ち絵などの無限の動きが1周で止まり、戻すと戻る
// （docs/architecture/screen-design/setting-place.md「設定の置き場所」）。実ブラウザの CSS でしか確かめられない。

/** 無限に繰り返すアニメーションを持つ要素（と ::before・::after）の数。 */
function countInfiniteAnimations(page: Page): Promise<number> {
  return page.evaluate(() => {
    const isInfinite = (style: CSSStyleDeclaration): boolean =>
      style.animationIterationCount.split(",").some((value) => value.trim() === "infinite")
    return [...document.querySelectorAll("*")]
      .flatMap((element) => [
        getComputedStyle(element),
        getComputedStyle(element, "::before"),
        getComputedStyle(element, "::after"),
      ])
      .filter(isInfinite).length
  })
}

test.describe("動きを減らす", () => {
  test("「減らす」で無限の動きが止まり、「OS の設定に従う」で戻る", async ({ run }) => {
    const room = await run.open({
      scenario: "motion-preference",
      scene: "work-strip-background",
      viewport: "large",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    const { page } = room
    // 場面は既定で OS の「動きを減らす」を立てているので、OS 側は外して歯車の好みだけを動かす。
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await expect.poll(() => countInfiniteAnimations(page)).toBeGreaterThan(0)

    await page.locator('button[aria-label="設定"][aria-haspopup="dialog"]').click()
    const dialog = page.getByRole("dialog", { name: "設定" })
    await dialog.getByRole("button", { name: "演出" }).click()
    await dialog.getByLabel("動きを減らすか").selectOption("reduce")
    await expect.poll(() => countInfiniteAnimations(page)).toBe(0)

    await dialog.getByLabel("動きを減らすか").selectOption("system")
    await expect.poll(() => countInfiniteAnimations(page)).toBeGreaterThan(0)
  })
})
