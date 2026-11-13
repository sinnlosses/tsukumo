import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"

// 新しい器の流れ（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `talk-flow-long` は利用者の発言2つ・セリフ4つ・段を終えた対2組が並ぶ。

async function reopenInStage(room: ScenarioRoom): Promise<Page> {
  const url = new URL(room.page.url())
  url.searchParams.set("shell", "stage")
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
      const page = await reopenInStage(room)

      await expect(page.locator('[data-slot="thread"]')).toBeVisible()
      await expect(page.locator('[data-slot="balloon"]').first()).toBeVisible()
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      await room.settleAndMatch(1000)
    })
  }

  test("背景の明るいテスト用パックでも、舞台の骨組みが出て横にはみ出さない", async ({ run }) => {
    const room = await run.open({
      scenario: "talk-flow-stage-bright",
      scene: "talk-flow-long",
      viewport: "laptop",
      domRoots: ["stage-thread", "stage-balloon"],
      characterPack: "bright",
    })
    await room.waitForEvent("tool-started")
    const page = await reopenInStage(room)

    await expect(page.locator('[data-slot="thread"]')).toBeVisible()
    await expect(page.locator('[data-slot="balloon"]').first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await room.settleAndMatch(1000)
  })
})
