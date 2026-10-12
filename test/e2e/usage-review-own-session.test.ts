import type { Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// トークンの画面の見直しが会話とは別に走ること（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `work-strip-plan-pending` はターンが進行中のまま止まる。同じ tsukumo をもう1つのタブでトークンの画面に開き、
// 見直しを始めて結果の札が出るまでを流し、仕事の画面のメインビューが変わらないことを DOM で判定する。
// 見直しの手順は疑似セッションの `usageReview.review`。期待値は撮らない。

const run = useScenarioRun()

const MAIN_VIEW = '[data-region="main"]'

/** メインビューの中身（要素の数と文字）。ブラウザの時計は凍っているので、経過の表示も動かない。 */
function mainViewContent(
  page: Page,
): Promise<{ readonly elements: number; readonly text: string }> {
  return page.locator(MAIN_VIEW).evaluate((element) => ({
    elements: element.querySelectorAll("*").length,
    text: element instanceof HTMLElement ? element.innerText : "",
  }))
}

describe("トークンの画面の見直し", () => {
  it("ターンが進行中でも始められ、結果の札が出て、仕事の画面のメインビューは変わらない", async () => {
    const room = await run.open({
      scenario: "usage-review-own-session",
      scene: "work-strip-plan-pending",
      viewport: "wide",
      domRoots: [],
    })
    const work = room.page
    await room.waitForEvent("tool-started")
    const before = await mainViewContent(work)

    const tokens = await work.context().newPage()
    const tokensUrl = new URL(work.url())
    tokensUrl.hash = "#token-usage"
    await tokens.goto(tokensUrl.toString())
    const start = tokens.getByRole("button", { name: "減らし方を見てもらう" })
    await start.waitFor()
    expect(await start.isDisabled()).toBe(false)
    await start.click()

    await room.waitForEvent("usage-review-ended")
    const section = tokens.getByRole("region", { name: "減らし方を見てもらう" })
    await section.getByText("架空のツールの結果が大きい").waitFor()
    expect(await section.getByRole("article").count()).toBe(2)

    expect(await mainViewContent(work)).toEqual(before)
    await tokens.close()
  })
})
