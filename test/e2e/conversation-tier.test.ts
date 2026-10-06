import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun, VIEWPORTS } from "./scenario-run.ts"
import { openTaskListRoomWithRunningTask } from "./task-room.ts"

// 会話の画面の段（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 761〜1100px ではサイドバーを柱に畳み、柱の口で重ねて開く。それより広い窓と狭い窓には柱を出さない。

const run = useScenarioRun()

const ELAPSED_MS = 60_000

function railToggle(page: Page): Locator {
  return page.getByRole("button", { name: "サイドバー", exact: true })
}

function sidebar(page: Page): Locator {
  return page.locator('[data-region="sidebar"]')
}

async function rightEdge(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().right)
}

async function leftEdge(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().left)
}

describe("会話の画面の段", () => {
  it.each(["medium", "tier-edge-medium"] as const)(
    "中くらいの窓幅ではサイドバーが柱に畳まれ、柱の口で重ねて開き、Esc と外側で閉じる（%s）",
    async (viewport) => {
      const room = await openTaskListRoomWithRunningTask(
        run,
        `conversation-tier-${viewport}`,
        ["sidebar"],
        viewport,
      )
      const { page } = room
      const toggle = railToggle(page)

      expect(await sidebar(page).isVisible()).toBe(false)
      expect(await toggle.getAttribute("aria-expanded")).toBe("false")
      await toggle.getByText("1", { exact: true }).waitFor()
      const runSettings = page.getByRole("group", { name: "実行の設定" })
      const visibleRunSettings = await runSettings.evaluateAll(
        (elements) => elements.filter((element) => element.checkVisibility()).length,
      )
      expect(visibleRunSettings).toBe(1)
      expect(await sidebar(page).getByRole("group", { name: "実行の設定" }).isVisible()).toBe(false)

      await toggle.click()
      expect(await toggle.getAttribute("aria-expanded")).toBe("true")
      await sidebar(page).waitFor()
      expect(await rightEdge(sidebar(page))).toBeLessThan(await leftEdge(toggle))
      await room.settleAndMatch(ELAPSED_MS)

      await page.keyboard.press("Escape")
      await sidebar(page).waitFor({ state: "hidden" })
      expect(await toggle.evaluate((element) => element === document.activeElement)).toBe(true)

      await toggle.click()
      await sidebar(page).waitFor()
      await page.locator('[data-region="main"]').click({ position: { x: 20, y: 20 } })
      await sidebar(page).waitFor({ state: "hidden" })
      expect(await toggle.getAttribute("aria-expanded")).toBe("false")
    },
  )

  it("狭い窓幅では柱を出さず上段のタブで切り替え、広い窓幅（1440px と境目の 1101px）では柱を出さずサイドバーと左右の仕切りが並ぶ", async () => {
    const room = await openTaskListRoomWithRunningTask(
      run,
      "conversation-tier-narrow",
      ["page"],
      "narrow",
    )
    const { page } = room

    await page.getByRole("tab", { name: "サイドバー" }).waitFor()
    expect(await railToggle(page).isVisible()).toBe(false)
    await room.settleAndMatch(ELAPSED_MS)

    for (const viewport of [VIEWPORTS.large, VIEWPORTS["tier-edge-large"]]) {
      await page.setViewportSize(viewport)
      await sidebar(page).waitFor()
      expect(await railToggle(page).isVisible()).toBe(false)
      expect(
        await page.getByRole("separator", { name: "メインビューとサイドバーの境界" }).isVisible(),
      ).toBe(true)
    }
  })
})
