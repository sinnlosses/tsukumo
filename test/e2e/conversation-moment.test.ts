import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"

// 会話の画面の局面（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 名指し無しの場面で、依頼の前・送ったあと・閉じたあとの紙の中身（`data-main-view-content`）の移り変わりと、器の姿勢、入力欄の下端を測る。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

const CONTENT_LOG = "__mainViewContentLog"

test.describe("会話の画面の局面", () => {
  for (const viewport of ["wide", "full-hd"] as const) {
    test(`送ると働くあいだの中身、閉じるとレポートへこの順に入れ替わり、器は迎える→働く→渡すの姿勢になり、入力欄の下端は動かない（${viewport}）`, async ({
      run,
    }) => {
      const room = await run.open({
        scenario: `conversation-moment-${viewport}`,
        scene: "none",
        viewport,
        domRoots: viewport === "wide" ? ["paper"] : [],
      })
      await recordContentChanges(room.page)
      await waitForContent(room.page, "welcome")
      const greet = await moment(room.page)

      const textArea = room.page.locator("textarea")
      await textArea.fill("局面の入れ替えを見たい（架空の依頼）")
      await textArea.press("Meta+Enter")
      await room.waitForEvent("request")
      await waitForContent(room.page, "work")
      const working = await moment(room.page)

      await room.waitForEvent("turn-finished")
      await waitForContent(room.page, "report")
      const delivered = await moment(room.page)

      expect(await contentLog(room.page)).toEqual(["welcome", "work", "report"])
      expect([greet.posture, working.posture, delivered.posture]).toEqual([
        "greet",
        "work",
        "deliver",
      ])
      expect(working.dockBottom).toBe(greet.dockBottom)
      expect(delivered.dockBottom).toBe(greet.dockBottom)
      if (viewport === "wide") {
        await room.settleAndMatchPicked(ELAPSED_MS)
      }
    })
  }
})

/** 器の姿勢と、入力欄の場所の下端。 */
async function moment(
  page: Page,
): Promise<{ readonly posture: string | null; readonly dockBottom: number }> {
  const [posture, dockBottom] = await Promise.all([
    page.locator("[data-posture]").first().getAttribute("data-posture"),
    page
      .locator('[data-region="dock"]')
      .evaluate((element) => element.getBoundingClientRect().bottom),
  ])
  return { posture, dockBottom }
}

/** メインビューの中身の値が変わるたびに、ページの中の控えに積む。 */
async function recordContentChanges(page: Page): Promise<void> {
  await page.evaluate((logName) => {
    const log: string[] = []
    Reflect.set(window, logName, log)
    const record = (): void => {
      const value = document
        .querySelector("[data-main-view-content]")
        ?.getAttribute("data-main-view-content")
      if (value !== undefined && value !== null && log.at(-1) !== value) {
        log.push(value)
      }
    }
    record()
    new MutationObserver(record).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-main-view-content"],
    })
  }, CONTENT_LOG)
}

async function contentLog(page: Page): Promise<unknown> {
  return page.evaluate((logName) => Reflect.get(window, logName), CONTENT_LOG)
}

async function waitForContent(page: Page, kind: string): Promise<void> {
  await page.waitForSelector(`[data-main-view-content="${kind}"]`)
}
