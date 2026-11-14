import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"

// 新しい器の紙のワークプラン（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `work-plan-long` は8段のうち5段目で手順が走ったまま止まる。`work-plan` は `turn-finished` まで流す。
// `work-plan-laps` は差し戻し2回のあと段が済み、`work-plan-delegates` は任せた役が6つで2つが済む。
// `work-plan-away` は2件目の記録のあと約 9 秒あけて残りの段と問いが届く（その間にページを隠す）。

async function reopenRoom(room: ScenarioRoom): Promise<Page> {
  const url = new URL(room.page.url())
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
    const page = await reopenRoom(room)
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
    const page = await reopenRoom(room)
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
    const page = await reopenRoom(room)
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
    const page = await reopenRoom(room)
    const plan = page.getByRole("region", { name: "ワークプラン" })

    await expect(plan).toContainText("架空の画を撮る役 ― 架空の幅 1400 の2枚目を撮っている")
    await expect(plan).toContainText("架空の並びを調べる役")
    await expect(plan.getByText("済んだ 2 つ")).toBeVisible()
    await expect(plan.getByText(/架空の型を直す役/u)).toBeHidden()
  })

  test("失敗で止まった紙に ✕ と続け方が出て、戻す口が依頼を入力欄に戻す", async ({ run }) => {
    const room = await run.open({
      scenario: "work-plan-paper-failed",
      scene: "work-plan-failed",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("turn-finished")
    const page = await reopenRoom(room)
    const plan = page.getByRole("region", { name: "ワークプラン" })

    await expect(plan).toContainText("失敗で止まった")
    await expect(plan).toContainText("ここで止まった")
    await expect(plan.getByRole("img", { name: "4段のうち4段目で止まった" })).toBeVisible()
    await expect(plan.getByRole("button", { name: /続きから再開する/u })).toBeVisible()
    await plan.getByRole("button", { name: "同じ依頼を入力欄に戻す" }).click()
    await expect(page.getByRole("textbox")).toHaveValue(/目盛りの数を設定から読む/u)
  })

  test("問いが今の段に出て、答える場所は入力欄だけ", async ({ run }) => {
    const room = await run.open({
      scenario: "work-plan-paper-ask",
      scene: "work-plan-ask",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("pending-changed")
    const page = await reopenRoom(room)
    const plan = page.getByRole("region", { name: "ワークプラン" })

    await expect(plan).toContainText("目盛りの既定の本数はいくつにする？")
    await expect(plan).toContainText("答えは下の入力欄で")
    await expect(plan.getByRole("button")).toHaveCount(0)
  })

  test("23 分離れて戻ると、紙の頭にまとめが4つの順で出て、印が境に引かれ、最初の操作で畳まれる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "work-plan-paper-away",
      scene: "work-plan-away",
      viewport: "wide",
      domRoots: ["page"],
    })
    await room.waitForEvent("work-plan", 2)
    const page = await reopenRoom(room)
    const plan = page.getByRole("region", { name: "ワークプラン" })
    await expect(plan.getByRole("img", { name: "4段のうち2段目" })).toBeVisible()

    await setPageHidden(page, true)
    await room.waitForEvent("pending-changed")
    await page.clock.runFor(AWAY_MS)
    await setPageHidden(page, false)

    const away = plan.getByRole("region", { name: "離れていたあいだのまとめ" })
    await expect(away).toContainText(
      "離れていた 23 分のあいだに、4段のうち3段が済んだ。あなたの答えが1つ要る。",
    )
    await expect(away.getByRole("heading")).toHaveText([
      "あなたを待っていること",
      "変わったこと",
      "置いた前提",
      "進め方",
    ])
    await expect(away).toContainText("重なる幅では間引くか、24 のまま重ねるか。")
    await expect(away).toContainText("答えは下の入力欄で")
    await expect(away).toContainText("目盛りの数は 4〜48 の範囲だけ受け付ける")
    await expect(away).toContainText("途中で円グラフにも目盛りがあると分かり")
    const items = plan.getByRole("listitem")
    await expect(items.filter({ hasText: "ここから先は、前に見たあと" })).toHaveCount(1)
    await expect(page.locator("li:has-text('ここから先は、前に見たあと') + li")).toContainText(
      "目盛りを設定から読む",
    )

    await away.getByRole("heading", { name: "進め方" }).click()
    await expect(away).toBeHidden()
    await expect(page.getByText("ここから先は、前に見たあと")).toBeHidden()
  })
})

/** 離れていた時間。見本の「離れていた 23 分」に合わせる。 */
const AWAY_MS = 23 * 60 * 1000

/** ページの `document.hidden` を上書きして `visibilitychange` を起こす（タブを裏に回した・戻したの模擬）。 */
async function setPageHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value })
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (value ? "hidden" : "visible"),
    })
    document.dispatchEvent(new Event("visibilitychange"))
  }, hidden)
}
