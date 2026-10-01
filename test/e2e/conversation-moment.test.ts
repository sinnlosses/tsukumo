import type { Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 会話の画面の局面（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 名指し無しの場面で、依頼の前・送ったあと・閉じたあとのメインビューの中身（`data-main-view-content`）の移り変わりと、4領域の寸法を測る。
// `moment-held` は、手順のあと4秒空けてからレポートを渡して閉じる。その間にメインビューへフォーカスを置いておく。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

const CONTENT_LOG = "__mainViewContentLog"

type RegionRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

describe("会話の画面の局面", () => {
  it.each(["large", "medium"] as const)(
    "送ると地図、閉じるとレポートへこの順に入れ替わり、4領域の位置と大きさは動かない（%s）",
    async (viewport) => {
      const room = await run.open({
        scenario: `conversation-moment-${viewport}`,
        scene: "none",
        viewport,
        domRoots: ["main"],
      })
      await recordContentChanges(room.page)
      await waitForContent(room.page, "welcome")
      const before = await regionRects(room.page)

      const textArea = room.page.locator("textarea")
      await textArea.fill("局面の入れ替えを見たい（架空の依頼）")
      await textArea.press("Meta+Enter")
      await room.waitForEvent("request")
      await waitForContent(room.page, "work-map")
      const working = await regionRects(room.page)

      await room.waitForEvent("turn-finished")
      await waitForContent(room.page, "report")
      const delivered = await regionRects(room.page)

      expect(await contentLog(room.page)).toEqual(["welcome", "work-map", "report"])
      expect(working).toEqual(before)
      expect(delivered).toEqual(before)
      await room.settleAndMatch(ELAPSED_MS)
    },
  )

  it("メインビューにフォーカスがあるあいだに閉じると中身と位置が動かず、札の頭に「レポートが届いた」が出て、押すとレポートへ入れ替わる", async () => {
    const room = await run.open({
      scenario: "conversation-moment-held",
      scene: "moment-held",
      viewport: "wide",
      domRoots: ["main"],
    })
    const { page } = room
    await waitForContent(page, "work-map")
    await page.locator('[data-region="main"] h2 button').focus()
    const scrollTop = await mainScrollTop(page)

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)

    expect(await shownContent(page)).toBe("work-map")
    expect(await mainScrollTop(page)).toBe(scrollTop)
    const notice = page.getByRole("button", { name: "レポートが届いた" })
    await notice.click()
    await waitForContent(page, "report")
  })
})

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

async function shownContent(page: Page): Promise<string | null> {
  return page.locator("[data-main-view-content]").getAttribute("data-main-view-content")
}

async function mainScrollTop(page: Page): Promise<number> {
  return page.locator('[data-region="main"]').evaluate((element) => element.scrollTop)
}

/** 4領域の位置と大きさ。 */
async function regionRects(page: Page): Promise<Readonly<Record<string, RegionRect>>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("[data-region]")].map((element) => {
        const rect = element.getBoundingClientRect()
        return [
          element.getAttribute("data-region") ?? "",
          { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        ]
      }),
    ),
  )
}
