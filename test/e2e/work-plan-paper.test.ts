import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"

// 新しい器の紙のワークプラン（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `work-plan-long` は8段のうち5段目で手順が走ったまま止まる。`work-plan` は `turn-finished` まで流す。
// `work-plan-laps` は差し戻し2回のあと段が済み、`work-plan-delegates` は任せた役が6つで2つが済む。

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

  test("差し戻された周が、段を増やさず同じ段の中に周目と理由で並ぶ", async ({ run }) => {
    const room = await run.open({
      scenario: "work-plan-paper-laps",
      scene: "work-plan-laps",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("tool-started")
    const page = await reopenInStage(room)
    const plan = page.getByRole("region", { name: "ワークプラン" })

    await expect(plan.getByRole("img", { name: "5段のうち4段目" })).toBeVisible()
    await expect(plan).toContainText("1周目")
    await expect(plan).toContainText("2周目")
    await expect(plan).toContainText("架空の受け入れで、同じ値の並びが崩れると差し戻された。")
    await expect(plan).toContainText("架空の再確認で、空の一覧の扱いが足りないと差し戻された。")
  })

  test("任せた役ごとに1行が出て、6つ以上なら済んだ役が畳まれる", async ({ run }) => {
    const room = await run.open({
      scenario: "work-plan-paper-delegates",
      scene: "work-plan-delegates",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("tool-started")
    const page = await reopenInStage(room)
    const plan = page.getByRole("region", { name: "ワークプラン" })

    await expect(plan).toContainText("架空の画を撮る役 ― 架空の幅 1400 の2枚目を撮っている")
    await expect(plan).toContainText("架空の並びを調べる役")
    await expect(plan.getByText("済んだ 2 つ")).toBeVisible()
    await expect(plan.getByText(/架空の型を直す役/u)).toBeHidden()
  })
})
