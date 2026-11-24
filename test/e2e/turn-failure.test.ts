import type { Locator, Page } from "playwright-core"

import { expectReadable } from "./readability-scan.ts"
import { expect, test } from "./room-fixture.ts"

// 失敗で終わったやり取りの頭の失敗の表示と、その次の手（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `api-failure` は `turn-finished` で流れ終わる。

const FAILURE_REQUEST = "API のサーバが不調な日に頼む（架空の依頼）"

test.describe("失敗の表示", () => {
  test("理由を人の言葉で出し、同じ依頼を入力欄に戻せる（送らない）。入力欄の下段は1段のまま", async ({
    run,
  }) => {
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
    expect(await block.locator("[title*='server_error']").count()).toBe(1)
    expect(await isAfterRequest(block)).toBe(true)
    await block.getByRole("button", { name: "同じ依頼を入力欄に戻す" }).waitFor()
    await expectReadable(room.page)

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

/** 失敗の表示が、依頼の投稿より後ろ（やり取りの末尾の側）にあるか。 */
function isAfterRequest(block: Locator): Promise<boolean> {
  return block.evaluate((element, request) => {
    const post = [...document.querySelectorAll('[data-region="main"] *')].find(
      (node) => node.children.length === 0 && node.textContent === request,
    )
    return (
      post !== undefined &&
      (post.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    )
  }, FAILURE_REQUEST)
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
