import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { type ScenarioRoom, useScenarioRun, VIEWPORTS } from "./scenario-run.ts"
import { openTaskListRoomWithRunningTask } from "./task-room.ts"

// 会話の画面の段（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 761〜1100px ではサイドバーを柱に畳み、柱の口で重ねて開く。それより広い窓と狭い窓には柱を出さない。
// 760px 以下は頭・本文・顔と吹き出し・入力欄の縦の1列になり、帯とサイドバーの中身は頭の ≡ から右に出る引き出しへ移る。

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

/** 狭い画面の頭の右上の ≡。 */
function menuToggle(page: Page): Locator {
  return page.getByRole("button", { name: "やり取りとタスクを開く", exact: true })
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

/** ページの横の幅（窓より広ければ横に転がる）。 */
async function scrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth)
}

/** `match` は部屋につき1回だけ真にする（`settleAndMatch` は時計を止める）。 */
async function expectRailOverlay(room: ScenarioRoom, match: boolean): Promise<void> {
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
  if (match) {
    await room.settleAndMatch(ELAPSED_MS)
  }

  await page.keyboard.press("Escape")
  await sidebar(page).waitFor({ state: "hidden" })
  expect(await toggle.evaluate((element) => element === document.activeElement)).toBe(true)

  await toggle.click()
  await sidebar(page).waitFor()
  await page.locator('[data-region="main"]').click({ position: { x: 20, y: 20 } })
  await sidebar(page).waitFor({ state: "hidden" })
  expect(await toggle.getAttribute("aria-expanded")).toBe("false")
}

describe("会話の画面の段", () => {
  it("中くらいの窓幅（1024px と境目の 1100px）ではサイドバーが柱に畳まれ、柱の口で重ねて開き、Esc と外側で閉じる", async () => {
    const room = await openTaskListRoomWithRunningTask(
      run,
      "conversation-tier-medium",
      ["sidebar"],
      "medium",
    )
    await expectRailOverlay(room, true)
    await room.resize(VIEWPORTS["tier-edge-medium"])
    await expectRailOverlay(room, false)
  })

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
      await room.resize(viewport)
      await sidebar(page).waitFor()
      expect(await railToggle(page).isVisible()).toBe(false)
      expect(
        await page.getByRole("separator", { name: "メインビューとサイドバーの境界" }).isVisible(),
      ).toBe(true)
    }
  })

  it("390x844 では上から頭・本文・顔と吹き出し・入力欄の縦の1列で、転がるのは本文だけ。吹き出しは3行で切れ、境目の 760px は頭のまま、761px は柱の段に戻る。≡ の引き出しも開閉でき、開いたまま窓を広げても本文が押せる", async () => {
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

    await expectDrawerFlow(room)

    await room.resize(VIEWPORTS["tier-edge-narrow"])
    expect(await menuToggle(page).isVisible()).toBe(true)
    expect(await railToggle(page).isVisible()).toBe(false)

    await room.resize(VIEWPORTS["tier-edge-rail"])
    await railToggle(page).waitFor()
    expect(await menuToggle(page).isVisible()).toBe(false)

    await room.resize(VIEWPORTS.phone)
    await expectDrawerSurvivesWiden(room)
  })

  async function expectDrawerFlow(room: ScenarioRoom): Promise<void> {
    const { page } = room
    const toggle = menuToggle(page)
    const drawer = page.getByRole("dialog", { name: "引き出し" })

    await toggle.click()
    await drawer.waitFor()

    const drawerBox = await drawer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { right: rect.right, width: rect.width }
    })
    expect(drawerBox).toEqual({ right: 390, width: 330 })
    const tops = await Promise.all(
      [
        drawer.getByRole("link", { name: "仕事" }),
        drawer.getByRole("tablist"),
        drawer.getByRole("tabpanel"),
        drawer.getByRole("button", { name: "＋ 新しいやり取り" }),
      ].map(async (locator) => (await box(locator)).top),
    )
    expect(tops).toEqual(tops.toSorted((a, b) => a - b))
    expect(await scrollWidth(page)).toBeLessThanOrEqual(390)

    for (const tab of ["タスク", "使用量", "やり取り"]) {
      await drawer.getByRole("tab", { name: tab }).click()
      expect(await drawer.getByRole("tab", { name: tab }).getAttribute("aria-selected")).toBe(
        "true",
      )
      expect(await scrollWidth(page)).toBeLessThanOrEqual(390)
    }
    await drawer.getByRole("button", { name: "設定", exact: true }).click()
    await drawer.getByRole("region", { name: "設定" }).waitFor()
    expect(await scrollWidth(page)).toBeLessThanOrEqual(390)
    await drawer.getByRole("button", { name: "‹ 戻る" }).click()
    await drawer.getByRole("tablist").waitFor()

    await page.keyboard.press("Escape")
    await drawer.waitFor({ state: "hidden" })
    expect(await toggle.evaluate((element) => element === document.activeElement)).toBe(true)

    await toggle.click()
    await drawer.waitFor()
    await page.mouse.click(20, 422)
    await drawer.waitFor({ state: "hidden" })
    expect(await toggle.getAttribute("aria-expanded")).toBe("false")

    await toggle.click()
    await drawer.getByRole("button", { name: /架空のタスクを進めて/u }).click()
    await drawer.waitFor({ state: "hidden" })
    expect(await page.locator('[data-region="main"]').isVisible()).toBe(true)
  }

  it("390x844 で依頼が “ の1行・中間レポートが1行ずつの一覧になり、行を押すと板が上がって ‹ › で前後の段へ移れ、Esc と覆いで閉じ押した行へフォーカスが戻り、頭の「手順 n」も板で開く", async () => {
    const room = await run.open({
      scenario: "conversation-tier-phone-sheet",
      scene: "phone-phases",
      viewport: "phone",
      domRoots: ["screen-nav", "main"],
    })
    const { page } = room
    const rows = page.locator('[data-region="main"] button[class*="phase-list-row"]')
    const sheet = page.getByRole("dialog", { name: "中間レポート" })

    await rows.nth(3).waitFor()
    expect(await rows.count()).toBe(4)
    expect(await scrollWidth(page)).toBeLessThanOrEqual(390)

    await rows.nth(1).click()
    await sheet.waitFor()
    const sheetBox = await sheet.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { bottom: rect.bottom, height: rect.height }
    })
    expect(sheetBox.bottom).toBe(844)
    expect(sheetBox.height).toBeLessThanOrEqual(600)
    expect(await scrollWidth(page)).toBeLessThanOrEqual(390)

    await sheet.getByRole("button", { name: /^次の段/u }).click()
    expect(await sheet.textContent()).toContain("3/5")
    await sheet.getByRole("button", { name: /^前の段/u }).click()
    await sheet.getByRole("button", { name: /^前の段/u }).click()
    expect(
      await sheet.getByRole("button", { name: /^前の段/u }).getAttribute("aria-disabled"),
    ).toBe("true")

    await page.keyboard.press("Escape")
    await sheet.waitFor({ state: "hidden" })
    expect(await rows.nth(1).evaluate((element) => element === document.activeElement)).toBe(true)

    await rows.nth(0).click()
    await sheet.waitFor()
    await page.mouse.click(195, 40)
    await sheet.waitFor({ state: "hidden" })

    await page
      .locator('nav[aria-label="画面"]')
      .getByRole("button", { name: /^手順/u })
      .click()
    await page.getByRole("dialog", { name: "依頼の手順" }).waitFor()
    expect(await scrollWidth(page)).toBeLessThanOrEqual(390)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog", { name: "依頼の手順" }).waitFor({ state: "hidden" })
    await room.settleAndMatch(PHONE_ELAPSED_MS)

    await rows.nth(0).click()
    await page.getByRole("dialog", { name: "中間レポート" }).waitFor()
    expect(await page.evaluate(() => document.querySelector("dialog:modal") !== null)).toBe(true)

    await room.resize(VIEWPORTS.large)
    await sidebar(page).waitFor()
    await page.waitForFunction(() => document.querySelector("dialog:modal") === null, undefined, {
      timeout: 3_000,
    })
    await page.getByRole("button", { name: "手順", exact: false }).first().click({ timeout: 3_000 })
  })

  async function expectDrawerSurvivesWiden(room: ScenarioRoom): Promise<void> {
    const { page } = room

    await menuToggle(page).click()
    await page.getByRole("dialog", { name: "引き出し" }).waitFor()
    expect(await page.evaluate(() => document.querySelector("dialog:modal") !== null)).toBe(true)

    await room.resize(VIEWPORTS.large)
    await sidebar(page).waitFor()
    await page.waitForFunction(() => document.querySelector("dialog:modal") === null, undefined, {
      timeout: 3_000,
    })
    await page.getByRole("button", { name: "手順", exact: false }).first().click({ timeout: 3_000 })
  }
})
