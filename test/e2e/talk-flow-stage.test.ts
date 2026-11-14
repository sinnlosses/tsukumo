import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"

// 新しい器の流れ（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `talk-flow-long` は利用者の発言2つ・セリフ4つ・段を終えた対2組が並ぶ。

async function reopenRoom(room: ScenarioRoom): Promise<Page> {
  const url = new URL(room.page.url())
  await room.page.goto(url.toString())
  return room.page
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe("新しい器の流れ", () => {
  for (const viewport of ["full-hd", "laptop"] as const) {
    test(`流れが長い場面を ${viewport} で開いても、舞台の骨組みが出て横にはみ出さない`, async ({
      run,
    }) => {
      const room = await run.open({
        scenario: `talk-flow-stage-${viewport}`,
        scene: "talk-flow-long",
        viewport,
        domRoots: ["stage-thread", "stage-balloon"],
      })
      await room.waitForEvent("tool-started")
      const page = await reopenRoom(room)

      await expect(page.locator('[data-slot="thread"]')).toBeVisible()
      await expect(page.locator('[data-slot="balloon"]').first()).toBeVisible()
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      await expectLastHerLineInsideThread(page)
      await room.settleAndMatch(1000)
    })
  }

  test("流れに利用者とキャラクターの行が並び、札でログが開き、狐火の行で紙のその段へ移る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "talk-flow-stage-jump",
      scene: "talk-flow-long",
      viewport: "full-hd",
      domRoots: [],
    })
    await room.waitForEvent("tool-started")
    const page = await reopenRoom(room)
    const thread = page.locator('[data-slot="thread"]')

    await expect(thread.locator('[data-who="you"]').first()).toBeVisible()
    await expect(thread.locator('[data-who="her"]').first()).toBeVisible()

    await thread.getByRole("button", { name: /これまでのやり取り/u }).click()
    const log = page.locator("dialog[open]")
    await log.waitFor()
    await page.keyboard.press("Escape")
    await log.waitFor({ state: "hidden" })

    await thread.locator('button[data-who="her"]').first().click()
    await expect(page.locator('main [data-step-id][data-jumped="true"]')).toHaveCount(1)
  })

  test("流れの依頼の行を押すと、紙がその回に替わる", async ({ run }) => {
    const room = await run.open({
      scenario: "talk-flow-stage-open-turn",
      scene: "turn-outline",
      viewport: "wide",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished", 5)
    const page = room.page
    const firstRow = page.locator('[data-slot="thread"] button[data-who="you"]', {
      hasText: "指示をタスクにする（架空の依頼）",
    })
    await expect(firstRow).not.toHaveAttribute("aria-current", "true")

    await firstRow.click()

    await expect(firstRow).toHaveAttribute("aria-current", "true")
    await expect(
      page.locator('[data-slot="thread"] button[data-who="you"][aria-current="true"]'),
    ).toHaveCount(1)
  })

  test("背景の明るいテスト用パックでも、舞台の骨組みが出て横にはみ出さない", async ({ run }) => {
    const room = await run.open({
      scenario: "talk-flow-stage-bright",
      scene: "talk-flow-long",
      viewport: "laptop",
      domRoots: ["stage-thread", "stage-balloon"],
      characterPack: "bright",
    })
    await room.waitForEvent("tool-started")
    const page = await reopenRoom(room)

    await expect(page.locator('[data-slot="thread"]')).toBeVisible()
    await expect(page.locator('[data-slot="balloon"]').first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await expectFlowBelowTodayStrip(page)
    await expectLastHerLineInsideThread(page)
    await room.settleAndMatch(1000)
  })
})

/**
 * 段が潰れると行が1つも見えなくなり、段の上端と札の位置だけでは気づけない。
 * 最後のキャラクターの行が、段の内側に丸ごと収まり、上端の札より下にあることで確かめる。
 */
async function expectLastHerLineInsideThread(page: Page): Promise<void> {
  const thread = page.locator('[data-slot="thread"]')
  // 行が足された直後は段が末尾へ転がり終わっていないので、収まるまで待つ。
  await expect
    .poll(async () => {
      const threadBox = await thread.boundingBox()
      const moreBox = await thread
        .getByRole("button", { name: /これまでのやり取り/u })
        .boundingBox()
      const lineBox = await thread.locator('[data-who="her"]').last().boundingBox()
      if (threadBox === null || moreBox === null || lineBox === null) {
        return "流れの段・これまでのやり取りの札・最後のキャラクターの行のどれかが描かれていない"
      }
      if (lineBox.y < moreBox.y + moreBox.height) {
        return `最後の行の上端 ${String(lineBox.y)} が札の下端 ${String(moreBox.y + moreBox.height)} より上`
      }
      if (lineBox.y + lineBox.height > threadBox.y + threadBox.height) {
        return `最後の行の下端 ${String(lineBox.y + lineBox.height)} が段の下端 ${String(threadBox.y + threadBox.height)} より下`
      }
      return ""
    })
    .toBe("")
}

/**
 * 立ち絵が大きいと流れの段が潰れ、押し出された行は段の外の上側に並ぶ（段の `overflow` で切って見せない）。
 * 見えるのは段の内側だけなので、段の上端と「これまでのやり取り」の札が、今日の灯りの下端より下にあることで確かめる。
 */
async function expectFlowBelowTodayStrip(page: Page): Promise<void> {
  const thread = page.locator('[data-slot="thread"]')
  const todayBox = await page.locator('[data-slot="today"]').boundingBox()
  const threadBox = await thread.boundingBox()
  const moreBox = await thread.getByRole("button", { name: /これまでのやり取り/u }).boundingBox()
  if (todayBox === null || threadBox === null || moreBox === null) {
    throw new Error("今日の灯り・流れの段・これまでのやり取りの札のどれかが描かれていない")
  }
  const todayBottom = todayBox.y + todayBox.height
  expect(threadBox.y).toBeGreaterThanOrEqual(todayBottom)
  expect(moreBox.y).toBeGreaterThanOrEqual(todayBottom)
  expect(await thread.evaluate((element) => getComputedStyle(element).overflowY)).toBe("hidden")
}
