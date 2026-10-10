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
    ).toEqual({ style: "solid", width: "1px" })
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

    const textArea = room.page.locator("textarea")
    await textArea.fill("読み上げを確かめたい（架空の依頼）")
    await textArea.press("Meta+Enter")
    await room.waitForEvent("turn-finished")

    await expect.poll(async () => count(await room.announced(), "レポートが届いた")).toBe(1)
    expect(count(await room.announced(), "作業を始めた")).toBe(1)
  })
})
