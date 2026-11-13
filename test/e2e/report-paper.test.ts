import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"

// 新しい器の紙のレポート（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `progress-delivered` は済んだ判定、`progress-ask` は選べる答え2つの「あなたの番」、`progress-short` は結論と段落1つの短い答え。

async function reopenInStage(room: ScenarioRoom): Promise<Page> {
  const url = new URL(room.page.url())
  url.searchParams.set("shell", "stage")
  await room.page.goto(url.toString())
  return room.page
}

test.describe("紙のレポート", () => {
  test("渡す紙は、頭に判定の行が出て、d で一目にすると頭だけが残る", async ({ run }) => {
    const room = await run.open({
      scenario: "report-paper-deliver",
      scene: "progress-delivered",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("turn-finished")
    const page = await reopenInStage(room)
    const body = page.locator("[data-report-body]")

    await expect(body.locator("[data-paper-form]")).toContainText("済んだ")
    await expect(body.getByRole("heading", { name: "架空の変えたところ" })).toBeVisible()
    await body.locator("[data-paper-form] p").first().click()
    await page.keyboard.press("d")
    await page.keyboard.press("d")
    await expect(body.getByRole("button", { name: "一目" })).toHaveAttribute("aria-pressed", "true")
    await expect(body.getByRole("heading", { name: "架空の変えたところ" })).toBeHidden()
  })

  test("判断を仰ぐ紙は、結論の直後のあなたの番で選んだ答えを入力欄に入れるだけで送らない", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "report-paper-decide",
      scene: "progress-ask",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("turn-finished")
    const page = await reopenInStage(room)
    const body = page.locator("[data-report-body]")

    await expect(body.locator("[data-paper-form]")).toContainText("あなたの番")
    await body.getByRole("button", { name: "消す" }).click()
    await expect(page.getByRole("textbox")).toHaveValue(/消す/u)
    await expect(body.locator("[data-paper-form]")).toHaveAttribute("data-paper-form", "decide")
  })

  test("短い答えの紙は、判定を答えたにし、あなたの番を出さない", async ({ run }) => {
    const room = await run.open({
      scenario: "report-paper-answer",
      scene: "progress-short",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("turn-finished")
    const page = await reopenInStage(room)
    const body = page.locator("[data-report-body]")

    await expect(body.locator("[data-paper-form]")).toContainText("答えた")
    await expect(body.getByRole("heading", { name: "あなたの番" })).toHaveCount(0)
  })
})
