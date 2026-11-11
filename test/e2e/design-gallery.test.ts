import { REPORT_COMPONENT_SCHEMAS } from "../../src/shared/report/a2ui-report-catalog.ts"
import { PARAMETER_COMPONENT_NAMES } from "../../src/shared/report/report-expression-block.ts"
import { expect, test } from "./room-fixture.ts"

// 見本帳（`#design`）を開くと、カタログの全部品が本文として並ぶこと
// （docs/architecture/testing.md「E2E のシナリオの一覧」）。期待値は撮らず DOM で判定する。

test.describe("見本帳", () => {
  test("`#design` を開くとカタログの全部品が本文として並び、読み込み中の器が残らない", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "design-gallery",
      scene: "report-blocks",
      viewport: "wide",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    const { page } = room

    await page.evaluate(() => {
      window.location.hash = "#design"
    })

    const parts = page.locator("[data-catalog-part]")
    await parts.first().waitFor()
    const galleryCount = Object.keys(REPORT_COMPONENT_SCHEMAS).filter(
      (name) => !PARAMETER_COMPONENT_NAMES.includes(name),
    ).length
    expect(await parts.count()).toBe(galleryCount)
    await page.waitForFunction(
      () => document.querySelectorAll("[data-catalog-part] [aria-busy]").length === 0,
    )
    expect(await page.locator("[data-catalog-part] [data-report-body]").count()).toBe(galleryCount)
  })

  test("Menu は Enter で選んでも Esc でも、もう一度ボタンを押しても閉じ、焦点がボタンへ戻る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "design-gallery",
      scene: "report-blocks",
      viewport: "wide",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    const { page } = room
    await page.evaluate(() => {
      window.location.hash = "#design"
    })

    const trigger = page.getByRole("button", { name: "見本のメニュー" })
    await trigger.waitFor()
    const row = page.getByRole("menuitem", { name: "操作その1" })
    const focusIsOnTrigger = (): Promise<boolean> =>
      trigger.evaluate((element) => element === document.activeElement)

    await trigger.click()
    await row.waitFor()
    expect(await trigger.getAttribute("aria-expanded")).toBe("true")
    await row.focus()
    await page.keyboard.press("Enter")
    await row.waitFor({ state: "hidden" })
    expect(await trigger.getAttribute("aria-expanded")).toBe("false")
    expect(await focusIsOnTrigger()).toBe(true)

    await trigger.click()
    await row.waitFor()
    await page.keyboard.press("Escape")
    await row.waitFor({ state: "hidden" })
    expect(await trigger.getAttribute("aria-expanded")).toBe("false")
    expect(await focusIsOnTrigger()).toBe(true)

    await trigger.click()
    await row.waitFor()
    await trigger.click()
    await row.waitFor({ state: "hidden" })
    expect(await trigger.getAttribute("aria-expanded")).toBe("false")
  })
})
