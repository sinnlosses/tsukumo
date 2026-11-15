import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"

// 離れていたあいだの境目の線（docs/architecture/screen-design/notice-and-failure.md「離れていたあいだの線」）。
// 場面 `reaction-accepted` は依頼のあと3秒でセリフが届く。依頼の最初の静かな区切りでページを隠し、
// セリフが届くまで隠したまま待ち、時計を1分進めて戻す。戻ると、新しいセリフの手前に線が1本出る。

/** 隠したままにする時間（時計を進める幅）。 */
const AWAY_MS = 60_000

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value })
    document.dispatchEvent(new Event("visibilitychange"))
  }, hidden)
}

test.describe("離れていたあいだの線", () => {
  test("隠れているあいだに足された行の手前に、離れていた時間つきの線が1本出る", async ({ run }) => {
    const room = await run.open({
      scenario: "away-seam",
      scene: "reaction-accepted",
      viewport: "wide",
      domRoots: ["main"],
    })
    const main = room.page.locator('[data-region="main"]')
    expect(await main.locator("[data-away-seam]").count()).toBe(0)

    await setHidden(room.page, true)
    await room.waitForEvent("turn-finished")
    await room.page.clock.fastForward(AWAY_MS)
    await setHidden(room.page, false)

    const seam = main.locator("[data-away-seam]")
    await seam.waitFor()
    expect(await seam.count()).toBe(1)
    expect(await seam.innerText()).toContain("ここから新しい")
    expect(await seam.innerText()).toContain("離れていた 1分")
    const nextRow = await seam.evaluate((element) => {
      const next = element.nextElementSibling
      return (
        next?.getAttribute("data-speaker") ??
        next?.querySelector("[data-speaker]")?.getAttribute("data-speaker") ??
        ""
      )
    })
    expect(nextRow).toBe("character")

    // 狭い画面は流れの行を描かないので、線も出ない。
    await room.resize({ width: 720, height: 900 })
    expect(await main.locator("[data-away-seam]").count()).toBe(0)
  })
})
