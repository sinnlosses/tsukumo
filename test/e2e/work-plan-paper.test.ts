import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"

// 新しい器の紙のワークプラン（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `work-plan-long` は8段のうち5段目で手順が走ったまま止まる。`work-plan` は `turn-finished` まで流す。

async function reopenInStage(room: ScenarioRoom): Promise<Page> {
  const url = new URL(room.page.url())
  url.searchParams.set("shell", "stage")
  await room.page.goto(url.toString())
  return room.page
}

test.describe("紙のワークプラン", () => {
  test("働くあいだ、判定の行と計画が紙に出て、長い並びは済んだ段を1行に畳む", async ({ run }) => {
    const room = await run.open({
      scenario: "work-plan-paper-long",
      scene: "work-plan-long",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("tool-started", 3)
    const page = await reopenInStage(room)
    const plan = page.getByRole("region", { name: "ワークプラン" })

    await expect(plan.getByRole("img", { name: "8段のうち5段目" })).toBeVisible()
    await expect(plan).toContainText("働いている")
    await expect(plan).toContainText("済んだ 4 段")
    await expect(plan).toContainText("5 か所目を移す")
    await expect(plan).toContainText("import.tsを読んでいる")
    await expect(plan).toContainText("全段の検査を通す")
  })

  test("終わったあと、同じ並びが紙の末尾の道筋に畳まれる", async ({ run }) => {
    const room = await run.open({
      scenario: "work-plan-paper-route",
      scene: "work-plan",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("turn-finished")
    const page = await reopenInStage(room)
    const route = page.getByText(/^この結論に至った道筋 ― 3段/u)

    await expect(route).toBeVisible()
    await route.click()
    await expect(page.getByRole("list", { name: "ワークプラン" })).toContainText(
      "ID の変換を両方の形に対応させる",
    )
  })
})
