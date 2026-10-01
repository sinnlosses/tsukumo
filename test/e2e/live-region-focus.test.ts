import type { Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 会話の画面の読み上げとフォーカス（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 読み上げの領域（`[data-live-announcer]`）へ挿入された文・ランドマーク・フォーカスの位置を、DOM だけで判定する。
// 期待値は撮らない（文は挿入の順と回数で見る）。

const run = useScenarioRun()

const COMPOSER = 'textarea[aria-label="依頼を書く"]'

function count(texts: readonly string[], text: string): number {
  return texts.filter((entry) => entry === text).length
}

/** フォーカスが `selector` に当たる要素に入るまで待つ。 */
async function waitForFocus(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target) => document.activeElement?.matches(target) === true, selector)
}

async function isFocused(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((target) => document.activeElement?.matches(target) === true, selector)
}

describe("会話の画面の読み上げとフォーカス", () => {
  it("開いた直後は入力欄にフォーカスがあり、名前と輪があり、main が1つで、スキップリンクが最初の Tab 停止になる", async () => {
    const room = await run.open({
      scenario: "live-region-focus-opening",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })
    const { page } = room

    await waitForFocus(page, COMPOSER)
    expect(
      await page.locator(COMPOSER).evaluate((element) => {
        const style = getComputedStyle(element)
        return { style: style.outlineStyle, width: style.outlineWidth }
      }),
    ).toEqual({ style: "solid", width: "2px" })
    expect(await page.getByRole("main", { name: "メインビュー" }).count()).toBe(1)
    expect(await page.getByRole("main").count()).toBe(1)

    const firstStop = await page.evaluate(
      () =>
        document.querySelector(
          "a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex='-1'])",
        )?.textContent,
    )
    expect(firstStop).toBe("入力欄へ移る")
    await page.getByRole("button", { name: "入力欄へ移る" }).focus()
    await page.keyboard.press("Enter")
    await waitForFocus(page, COMPOSER)
  })

  it("送ると「作業を始めた」、閉じると「レポートが届いた」が1回ずつ読まれる", async () => {
    const room = await run.open({
      scenario: "live-region-focus-send",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })
    const textArea = room.page.locator("textarea")
    await textArea.fill("読み上げを確かめたい（架空の依頼）")
    await textArea.press("Meta+Enter")
    await room.waitForEvent("turn-finished")

    await expect.poll(async () => count(await room.announced(), "レポートが届いた")).toBe(1)
    expect(count(await room.announced(), "作業を始めた")).toBe(1)
  })

  it("セリフが1回ずつ読まれ、閉じたあとの語が最後に来る", async () => {
    const room = await run.open({
      scenario: "live-region-focus-speech",
      scene: "closing-narration-quick",
      viewport: "wide",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")

    await expect.poll(async () => (await room.announced()).at(-1)).toBe("レポートが届いた")
    const announced = await room.announced()
    expect(announced.filter((text) => text === "見てくるぞ。")).toHaveLength(1)
    expect(announced.filter((text) => text === "ほら、片付いたぞ。")).toHaveLength(1)
    expect(announced.indexOf("見てくるぞ。")).toBeLessThan(announced.indexOf("ほら、片付いたぞ。"))
  })

  it("答え待ちが来ると「お伺いが届いた」が読まれる", async () => {
    const room = await run.open({
      scenario: "live-region-focus-ask",
      scene: "permission-asking",
      viewport: "wide",
      domRoots: [],
    })
    await expect.poll(async () => count(await room.announced(), "お伺いが届いた")).toBe(1)
  })

  it("失敗で終わると「失敗で終わった」が1回読まれる", async () => {
    const room = await run.open({
      scenario: "live-region-focus-failure",
      scene: "api-failure",
      viewport: "wide",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    await expect.poll(async () => count(await room.announced(), "失敗で終わった")).toBe(1)
  })

  it("閉じたとき、フォーカスがメインビューの外にあれば入力欄へ入る", async () => {
    const room = await run.open({
      scenario: "live-region-focus-closed",
      scene: "moment-held",
      viewport: "wide",
      domRoots: [],
    })
    const { page } = room
    await page.locator('[data-region="sidebar"] button').first().focus()
    expect(await isFocused(page, "textarea")).toBe(false)

    await room.waitForEvent("turn-finished")

    await waitForFocus(page, COMPOSER)
  })

  it("閉じたとき、フォーカスがメインビューの中にあれば動かさない", async () => {
    const room = await run.open({
      scenario: "live-region-focus-main",
      scene: "moment-held",
      viewport: "wide",
      domRoots: [],
    })
    const { page } = room
    await page.locator('[data-region="main"] h2 button').focus()

    await room.waitForEvent("turn-finished")
    await page.getByRole("button", { name: "レポートが届いた" }).waitFor()

    expect(await isFocused(page, '[data-region="main"] h2 button')).toBe(true)
  })

  it("閉じたとき、重なる面（セリフのログ）が開いていれば動かさない", async () => {
    const room = await run.open({
      scenario: "live-region-focus-overlay",
      scene: "moment-held",
      viewport: "wide",
      domRoots: [],
    })
    const { page } = room
    await page.getByRole("button", { name: "ログ", exact: true }).click()
    const dialog = page.locator('dialog[aria-label="セリフのログ"]')
    await dialog.waitFor({ state: "visible" })

    await room.waitForEvent("turn-finished")
    await page.waitForSelector('[data-main-view-content="report"]')

    expect(await isFocused(page, COMPOSER)).toBe(false)
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  })
})
