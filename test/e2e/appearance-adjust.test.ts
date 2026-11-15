import type { Locator } from "playwright-core"

import { expect, test } from "./room-fixture.ts"

// 歯車の設定の「見た目」の面の、背景の暗さ・パネルのぼかし・パネルの濃さ（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 範囲入力を動かして読み直しても、値が documentElement のトークンと操作子に残ることを確かめる。
// 期待値は撮らず、値で判定する。

test.describe("見た目の調整", () => {
  test("3つの範囲入力を動かして読み直しても、値が残る", async ({ run }) => {
    const room = await run.open({
      scenario: "appearance-adjust",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })
    const { page } = room
    const openLookFace = async (): Promise<Locator> => {
      await page.locator('button[aria-label="設定"][aria-haspopup="dialog"]').click()
      const dialog = page.getByRole("dialog", { name: "設定" })
      await dialog.getByRole("button", { name: "見た目" }).click()
      return dialog
    }

    const dialog = await openLookFace()
    await dialog.getByRole("slider", { name: "背景の暗さ" }).fill("90")
    await dialog.getByRole("slider", { name: "パネルのぼかし" }).fill("16")
    await dialog.getByRole("slider", { name: "パネルの濃さ" }).fill("60")
    await page.reload()

    const rootToken = (name: string): Promise<string> =>
      page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name)
    expect([
      await rootToken("--character-background-veil-user"),
      await rootToken("--panel-blur-user"),
      await rootToken("--panel-fill-user"),
    ]).toEqual(["0.9", "16px", "60%"])

    const reopened = await openLookFace()
    expect([
      await reopened.getByRole("slider", { name: "背景の暗さ" }).inputValue(),
      await reopened.getByRole("slider", { name: "パネルのぼかし" }).inputValue(),
      await reopened.getByRole("slider", { name: "パネルの濃さ" }).inputValue(),
    ]).toEqual(["90", "16", "60"])
  })
})
