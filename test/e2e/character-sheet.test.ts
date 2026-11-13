import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"

// 新しい器「舞台と紙」のキャラクターの紙（docs/architecture/testing.md「E2E のシナリオの一覧」）。

/** 舞台の立ち絵の src と、`<html>` が持つ背景・差し色の変数。 */
async function stageLook(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => ({
    portrait: document.querySelector('[data-region="stage"] img')?.getAttribute("src") ?? null,
    background: document.documentElement.style.getPropertyValue("--character-background-image"),
    accent: document.documentElement.style.getPropertyValue("--accent"),
  }))
}

test.describe("キャラクターの紙", () => {
  test("使用中でないパックへ切り替えると、舞台の立ち絵・背景・差し色が替わる", async ({ run }) => {
    const room = await run.open({
      scenario: "character-sheet-switch",
      scene: "none",
      viewport: "wide",
      domRoots: ["page"],
    })
    const url = new URL(room.page.url())
    url.searchParams.set("shell", "stage")
    await room.page.goto(url.toString())
    await room.page.getByRole("link", { name: "キャラ", exact: true }).click()
    const list = room.page.getByRole("navigation", { name: "キャラクター一覧" })
    await list.waitFor()

    const before = await stageLook(room.page)
    await list.getByRole("link").filter({ hasNotText: "使用中" }).first().click()
    await room.page.getByRole("button", { name: /このキャラクターに切り替える/ }).click()
    await expect
      .poll(async () => JSON.stringify(await stageLook(room.page)))
      .not.toBe(JSON.stringify(before))
    const after = await stageLook(room.page)
    expect(after["portrait"]).not.toBe(before["portrait"])
    expect(after["background"]).not.toBe(before["background"])
    expect(after["accent"]).not.toBe(before["accent"])
  })
})
