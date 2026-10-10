import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 狭い画面（760px 以下）の入力欄。
// 押せる大きさが 40〜44 に収まることと、ソフトウェアキーボードを模した高さでの収まりを実ブラウザで測る。期待値は撮らない。

const run = useScenarioRun()

const MIN_SIZE = 39.95
const MAX_SIZE = 44.05
const KEYBOARD_HEIGHT = 450

async function expectTouchSize(locator: Locator): Promise<void> {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.width).toBeGreaterThanOrEqual(MIN_SIZE)
  expect(box?.height).toBeGreaterThanOrEqual(MIN_SIZE)
  expect(box?.height).toBeLessThanOrEqual(MAX_SIZE)
}

async function waitForScrollHeight(page: Page, height: number): Promise<void> {
  await page.waitForFunction(
    (expected) => document.scrollingElement?.scrollHeight === expected,
    height,
  )
}

describe("狭い画面の入力欄", () => {
  it("390x844 で ＋・丸ボタン・＋ の面・■ の確かめの札の押せる大きさが 40〜44 に収まり、■ は確かめてから止める", async () => {
    const room = await run.open({
      scenario: "phone-composer-size",
      scene: "phone-layout",
      viewport: "phone",
      domRoots: [],
    })
    const { page } = room
    const stop = page.getByRole("button", { name: "中断する" })
    await stop.waitFor()

    await expectTouchSize(page.getByRole("button", { name: "添える", exact: true }))
    await expectTouchSize(stop)
    expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain(
      "interactive-widget=resizes-content",
    )

    await page.getByRole("button", { name: "添える", exact: true }).click()
    const sheet = page.getByRole("group", { name: "添える" })
    for (const name of ["画像を添える", "/ コマンド", "@ ファイル"]) {
      await expectTouchSize(sheet.getByRole("button", { name }))
    }
    await page.keyboard.press("Escape")

    await stop.click()
    await expectTouchSize(page.getByRole("button", { name: "止める", exact: true }))
    await expectTouchSize(page.getByRole("button", { name: "続ける", exact: true }))
    await page.getByRole("button", { name: "続ける", exact: true }).click()
    expect(await page.getByRole("button", { name: "止める", exact: true }).count()).toBe(0)
  })

  it("キーボードを模した低い窓で、入力欄が窓に収まり、吹き出しは顔だけに畳まれる", async () => {
    const room = await run.open({
      scenario: "phone-composer-keyboard",
      scene: "phone-layout",
      viewport: "phone",
      domRoots: [],
    })
    const { page } = room
    const balloon = page.locator('[data-region="character"]').getByRole("button", {
      name: /^その前に/u,
    })
    await page.getByRole("button", { name: "中断する" }).waitFor()
    await balloon.waitFor()
    expect(await balloon.isVisible()).toBe(true)

    await page.setViewportSize({ width: 390, height: KEYBOARD_HEIGHT })
    await waitForScrollHeight(page, KEYBOARD_HEIGHT)
    const field = page.getByRole("textbox")
    await field.focus()
    await waitForScrollHeight(page, KEYBOARD_HEIGHT)

    expect(await balloon.isVisible()).toBe(false)
    const box = await field.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(KEYBOARD_HEIGHT)
    expect(box?.y).toBeGreaterThanOrEqual(0)
  })
})
