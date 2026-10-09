import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun, VIEWPORTS } from "./scenario-run.ts"
import { openTaskListRoomWithRunningTask } from "./task-room.ts"

// 会話の画面の段（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 761〜1100px ではサイドバーを柱に畳み、柱の口で重ねて開く。それより広い窓と狭い窓には柱を出さない。
// 760px 以下は頭・本文・顔と吹き出し・入力欄の縦の1列になる。

const run = useScenarioRun()

const ELAPSED_MS = 60_000

/** `phone-layout` の場面のターンが走っているあいだの経過（ターンは 60 秒で閉じる）。 */
const PHONE_ELAPSED_MS = 5_000

function railToggle(page: Page): Locator {
  return page.getByRole("button", { name: "サイドバー", exact: true })
}

function sidebar(page: Page): Locator {
  return page.locator('[data-region="sidebar"]')
}

/** 狭い画面の頭の右上の「≡」。 */
function menuToggle(page: Page): Locator {
  return page.getByRole("button", { name: "メニュー", exact: true })
}

type Box = { readonly top: number; readonly bottom: number }

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  })
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

  it("狭い窓幅では柱もタブ帯もサイドバーも出さずに頭の「≡」を出し、広い窓幅（1440px と境目の 1101px）では柱を出さずサイドバーと左右の仕切りが並ぶ", async () => {
    const room = await openTaskListRoomWithRunningTask(
      run,
      "conversation-tier-narrow",
      ["page"],
      "narrow",
    )
    const { page } = room

    await menuToggle(page).waitFor()
    expect(await railToggle(page).isVisible()).toBe(false)
    expect(await page.getByRole("tablist").count()).toBe(0)
    expect(await sidebar(page).isVisible()).toBe(false)
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

  it("390x844 では上から頭・本文・顔と吹き出し・入力欄の縦の1列で、転がるのは本文だけ。吹き出しは3行で切れ、境目の 760px は頭のまま、761px は柱の段に戻る", async () => {
    const room = await run.open({
      scenario: "conversation-tier-phone",
      scene: "phone-layout",
      viewport: "phone",
      domRoots: ["screen-nav", "character"],
    })
    const { page } = room
    const head = page.locator('nav[aria-label="画面"]')
    const main = page.locator('[data-region="main"]')
    const character = page.locator('[data-region="character"]')
    const dispatch = page.locator('[data-region="dispatch"]')
    const balloon = character.getByRole("button", { name: /^その前に/u })

    await balloon.waitFor()
    await head.getByRole("button", { name: /^手順/u }).waitFor()
    expect(await menuToggle(page).isVisible()).toBe(true)

    const [headBox, mainBox, characterBox, dispatchBox] = await Promise.all(
      [head, main, character, dispatch].map(box),
    )
    expect(headBox?.top).toBe(0)
    expect(mainBox?.top).toBeGreaterThanOrEqual(headBox?.bottom ?? Number.POSITIVE_INFINITY)
    expect(characterBox?.top).toBeGreaterThanOrEqual(mainBox?.bottom ?? Number.POSITIVE_INFINITY)
    expect(dispatchBox?.top).toBeGreaterThanOrEqual(
      characterBox?.bottom ?? Number.POSITIVE_INFINITY,
    )
    expect(dispatchBox?.bottom).toBe(844)
    expect((await box(balloon)).bottom).toBeLessThanOrEqual(dispatchBox?.top ?? 0)

    const clamped = await balloon.evaluate((element) => {
      const text = element.firstElementChild
      return text !== null && text.scrollHeight > text.clientHeight
    })
    expect(clamped).toBe(true)
    const scroll = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }))
    expect(scroll.width).toBeLessThanOrEqual(390)
    expect(scroll.height).toBeLessThanOrEqual(844)

    expect(await page.getByRole("tablist").count()).toBe(0)
    expect(await sidebar(page).isVisible()).toBe(false)
    expect(await page.locator('nav[aria-label="やり取り"]').isVisible()).toBe(false)
    expect(await character.locator("[data-expression]").first().isVisible()).toBe(false)
    await room.settleAndMatch(PHONE_ELAPSED_MS)

    await page.setViewportSize(VIEWPORTS["tier-edge-narrow"])
    expect(await menuToggle(page).isVisible()).toBe(true)
    expect(await railToggle(page).isVisible()).toBe(false)

    await page.setViewportSize(VIEWPORTS["tier-edge-rail"])
    await railToggle(page).waitFor()
    expect(await menuToggle(page).isVisible()).toBe(false)
  })
})
