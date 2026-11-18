import type { Locator } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import { LONG_TOOL_OCCURRENCE, phaseStates, stripOf } from "./work-strip-probe.ts"

// 下線の区間を押すと、フェーズの詳細が押した区間の下に重なって出る（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `work-strip-running` の4つ目の手順（長い Bash）が走り出したあと、1つ目の区間が済み、2つ目が今になる。

test.describe("進み具合のフェーズの詳細", () => {
  test("済んだ区間を押すと詳細が区間の下に重なって出て、外を押すと閉じ、「手順」を押すと重なる全体の詳細に替わる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "work-strip-running",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["work-strip"],
    })
    const strip = stripOf(room.page)
    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await expect.poll(() => phaseStates(strip)).toEqual(["done", "current", "upcoming", "upcoming"])
    const flowHead = room.page.locator('[data-region="main"] [class*="request-block"]').first()
    const flowTopBefore = await topOf(flowHead)

    const segment = strip.locator('[data-segment-state="done"]').first()
    await segment.click()

    const detail = strip.getByRole("region", { name: /の詳細$/ })
    await expect(detail).toBeVisible()
    await expect(detail).toContainText("1/4 · 済み")
    const stripBox = await boxOf(strip)
    const detailBox = await boxOf(detail)
    const segmentBox = await boxOf(segment)
    expect(detailBox.top).toBeGreaterThanOrEqual(stripBox.bottom)
    expect(detailBox.top).toBeGreaterThanOrEqual(segmentBox.bottom)
    expect(detailBox.left).toBeGreaterThanOrEqual(stripBox.left)
    expect(detailBox.right).toBeLessThanOrEqual(stripBox.right)
    expect(await topOf(flowHead)).toBe(flowTopBefore)

    await room.page.mouse.click(stripBox.left + stripBox.width / 2, stripBox.bottom + 400)
    await expect(detail).toHaveCount(0)

    await segment.click()
    await expect(detail).toBeVisible()
    await strip.getByRole("button", { name: /^手順/ }).click()

    await expect(detail).toHaveCount(0)
    await expect(strip.getByRole("region", { name: "依頼の手順" })).toBeVisible()
  })
})

async function topOf(locator: Locator): Promise<number> {
  return (await boxOf(locator)).top
}

async function boxOf(
  locator: Locator,
): Promise<{ top: number; bottom: number; left: number; right: number; width: number }> {
  const box = await locator.boundingBox()
  if (box === null) {
    throw new Error("要素の位置が測れない")
  }
  return {
    top: box.y,
    bottom: box.y + box.height,
    left: box.x,
    right: box.x + box.width,
    width: box.width,
  }
}
