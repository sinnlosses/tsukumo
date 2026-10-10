import type { Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 狭い画面（760px 以下）の答え待ちの札。
// 位置・押した瞬間に答えること・板の中の1列の形と横に転がらないことを実ブラウザで確かめる。期待値は撮らない。

const run = useScenarioRun()

function cardOf(page: Page) {
  return page.getByRole("region", { name: "答え待ち" })
}

describe("狭い画面の答え待ちの札", () => {
  it("390x844 で、本文を転がしても札は入力欄のすぐ上から動かず、ページは横にも縦にも転がらない", async () => {
    const room = await run.open({
      scenario: "phone-inquiry-fixed",
      scene: "phone-inquiry-pick",
      viewport: "phone",
      domRoots: [],
    })
    const { page } = room
    const card = cardOf(page)
    await card.waitFor()

    const dispatch = page.locator('[data-region="dispatch"]')
    const gap = async (): Promise<number> => {
      const [cardBox, dispatchBox] = await Promise.all([card.boundingBox(), dispatch.boundingBox()])
      expect(cardBox).not.toBeNull()
      expect(dispatchBox).not.toBeNull()
      return (dispatchBox?.y ?? 0) - ((cardBox?.y ?? 0) + (cardBox?.height ?? 0))
    }
    const before = await card.boundingBox()
    // 本文を転がるほど長くして、いちばん下まで転がす。
    const scrolled = await page.evaluate(() => {
      const main = document.querySelector('[data-region="main"]')
      if (!(main instanceof HTMLElement)) {
        return -1
      }
      const spacer = document.createElement("div")
      spacer.style.height = "3000px"
      main.appendChild(spacer)
      main.scrollTop = 1000
      return main.scrollTop
    })
    expect(scrolled).toBeGreaterThan(0)
    const after = await card.boundingBox()

    expect(after?.y).toBe(before?.y)
    expect(await gap()).toBeLessThanOrEqual(1)
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }))
    expect(overflow).toEqual({ x: 0, y: 0 })
    expect(
      await page.getByPlaceholder("答えを書くか、上で選ぶ").count(),
      "質問のあいだの置き文字",
    ).toBe(1)
    expect(await page.getByRole("button", { name: "お伺いへ" }).count()).toBe(0)
  })

  it("許可は「許可」を押した瞬間に答えが流れ、札が消える", async () => {
    const room = await run.open({
      scenario: "phone-inquiry-permission",
      scene: "permission",
      viewport: "phone",
      domRoots: [],
    })
    const card = cardOf(room.page)
    await room.waitForEvent("turn-finished")
    expect(
      await card.getByRole("button").evaluateAll((buttons) => buttons.map((b) => b.textContent)),
    ).toEqual(["拒否", "許可"])

    await card.getByRole("button", { name: "許可", exact: true }).click()

    await room.waitForEvent("pending-changed", 2)
    await expect.poll(() => card.count()).toBe(0)
  })

  it("質問は、選択肢を押した瞬間に次の問いへ進み、最後の問いで全問ぶんが届く", async () => {
    const room = await run.open({
      scenario: "phone-inquiry-pair",
      scene: "question-pair",
      viewport: "phone",
      domRoots: [],
    })
    const card = cardOf(room.page)

    await card.getByRole("button", { name: /道具B/ }).click()
    await expect.poll(() => card.textContent()).toContain("2 / 2")
    await card.getByRole("button", { name: /土台/ }).click()

    await room.waitForEvent("question-answered")
    await expect.poll(() => card.count()).toBe(0)
  })

  it("「詳しく」の板に1列の形が出て、板の中も横に転がらず、選んで「これで答える」で答えると板が閉じる", async () => {
    const room = await run.open({
      scenario: "phone-inquiry-brief-sheet",
      scene: "phone-inquiry-pick",
      viewport: "phone",
      domRoots: [],
    })
    const { page } = room
    await cardOf(page).getByRole("button", { name: "詳しく" }).click()
    const sheet = page.locator("dialog[open]")
    await sheet.waitFor()

    const detail = sheet.getByRole("group", { name: /の詳細$/ })
    const [last, panel] = await Promise.all([
      sheet.getByRole("radio", { name: /やめておく/ }).boundingBox(),
      detail.boundingBox(),
    ])
    expect(last !== null && panel !== null && panel.y >= last.y + last.height).toBe(true)
    const overflow = await page.evaluate(() => {
      const body = document.querySelector('dialog[open] [class*="bottom-sheet-body"]')
      return {
        sheet: body === null ? -1 : body.scrollWidth - body.clientWidth,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(overflow).toEqual({ sheet: 0, page: 0 })

    await sheet.getByRole("radio", { name: /1件ずつ確かめる/ }).click()
    await sheet.getByRole("button", { name: "これで答える" }).click()

    await room.waitForEvent("pending-changed", 2)
    await expect.poll(() => page.locator("dialog[open]").count()).toBe(0)
    await expect.poll(() => cardOf(page).count()).toBe(0)
  })
})
