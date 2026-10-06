import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 失敗で終わったやり取りの頭の失敗の塊と、その次の手（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `api-failure` は `turn-finished` で流れ終わる。

const run = useScenarioRun()

const FAILURE_REQUEST = "API のサーバが不調な日に頼む（架空の依頼）"

describe("失敗の塊", () => {
  it("理由を人の言葉で出し、同じ依頼を入力欄に戻せる（送らない）。入力欄の下段は1段のまま", async () => {
    const room = await run.open({
      scenario: "turn-failure-retry",
      scene: "api-failure",
      viewport: "medium",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    const block = failureBlock(room.page)
    await block.waitFor()

    expect(await block.textContent()).not.toContain("server_error")
    expect(await block.locator('[title*="server_error"]').count()).toBe(1)
    expect(await isAtHeadOfCard(block)).toBe(true)

    await block.getByRole("button", { name: "同じ依頼を入力欄に戻す" }).click()

    expect(await draft(room.page)).toBe(FAILURE_REQUEST)
    expect(await room.page.locator('[data-main-view-content="report"]').count()).toBe(1)
    expect(await isDispatchRowSingle(room.page)).toBe(true)
  })
})

function failureBlock(page: Page): Locator {
  return page.locator('[data-region="main"]').getByRole("note", { name: "失敗で終わった" })
}

function draft(page: Page): Promise<string> {
  return page.locator("textarea").inputValue()
}

/** 失敗の塊が札の本文の先頭にあるか（レポートより前）。 */
function isAtHeadOfCard(block: Locator): Promise<boolean> {
  return block.evaluate((element) => {
    const card = element.closest("article")
    const first = card?.querySelector('[role="note"], [class*="main-step"]')
    return first === element
  })
}

/** 入力欄の下段（道具の口と送信の行）が1段に収まっているか。2段に折れると、行の高さが送信ボタン2つ分を超える。 */
function isDispatchRowSingle(page: Page): Promise<boolean> {
  return page.locator('[data-region="dispatch"]').evaluate((region) => {
    const send = region.querySelector('button[type="submit"]')
    const toolbar = send?.parentElement?.parentElement
    if (send === null || toolbar === null || toolbar === undefined) {
      return false
    }
    return toolbar.getBoundingClientRect().height < send.getBoundingClientRect().height * 2
  })
}
