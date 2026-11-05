import { expect, test, VIEWPORTS } from "./room-fixture.ts"
import { nextAnimationFrame } from "./scenario-wait.ts"

// report → メインビュー（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// `report` ツールの呼び出しがメインビューの Markdown へどう出るかを、疑似セッションの場面で確かめる:
// `notation`（記法の一覧）、`report-chart`（グラフの塊。ベンダのスクリプトが描く）、
// `long-report-quick`（やり取りの列。札の幅で畳む）、
// `a2ui-parameter-sample`（つまみを振ると数・文・図の強調が変わり、開き直すと初期値に戻る）、
// `turn-outline`（やり取りの列の上の段のやり取りと結果の印）、
// `reading-position`（別のやり取りへ移って戻ると読んでいた見出しの位置から見える）。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("report → メインビュー", () => {
  test("記法の一覧がメインビューに描かれる", async ({ run }) => {
    const room = await run.open({
      scenario: "report-notation",
      scene: "notation",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("部品の一覧で受けた report が A2UI の面で節・表・図として描かれる", async ({ run }) => {
    const room = await run.open({
      scenario: "a2ui-surface",
      scene: "a2ui-surface-sample",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("操作できる Table は、ChoicePicker の選択で行が絞られ、列名のボタンで並べ替わる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "a2ui-interactive",
      scene: "a2ui-interactive-sample",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: "乙", exact: true }).click()
    await room.page.getByRole("button", { name: "件数", exact: true }).click()
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("触れるレポートは、つまみを振ると数・文・図の強調が変わり、開き直すと初期値に戻る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "a2ui-parameter",
      scene: "a2ui-parameter-sample",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    const slider = room.page.getByRole("slider", { name: "worker 数" })
    const check = room.page.getByRole("checkbox", { name: /E2E を含める/ })
    const body = room.page.locator("[data-report-body]").filter({ visible: true })
    await expect(slider).toBeEnabled()
    await expect(body).toContainText("いまの w = 4 は最速より 8 秒遅い")
    await expect(body).toContainText("84")
    // 強調の位置は、図へ渡った設定の `tsukumo-series` から読む（塗り分けは目視の領分）。
    const emphasizedBars = async (): Promise<unknown> => {
      // 描画のフレームが回らないと交差の通知が届かず、図が読み込まれない。
      await nextAnimationFrame(room.page)
      return room.page.evaluate(() => {
        const canvas = [...document.querySelectorAll("canvas")].find((c) => c.offsetParent !== null)
        const getChart: unknown = Reflect.get(Reflect.get(globalThis, "Chart") ?? {}, "getChart")
        if (canvas === undefined || typeof getChart !== "function") {
          return undefined
        }
        return getChart(canvas)?.config.options.plugins["tsukumo-series"].emphasis
      })
    }
    await body.locator("canvas").scrollIntoViewIfNeeded()
    await room.page.clock.runFor(1000)
    await expect.poll(emphasizedBars).toEqual([5])

    await slider.fill("2")
    await expect(body).toContainText("いまの w = 2 は最速より 56 秒遅い")
    await expect(body).toContainText("132")
    await expect.poll(emphasizedBars).toEqual([5])

    await check.check()
    await expect(body).toContainText("E2E を含めると")
    await expect(body).toContainText("360")
    await expect.poll(emphasizedBars).toEqual([7])

    await room.page.reload({ waitUntil: "domcontentloaded" })
    await expect(slider).toHaveValue("4")
    await expect(check).not.toBeChecked()
    await expect(body).toContainText("いまの w = 4 は最速より 8 秒遅い")
    await body.locator("canvas").scrollIntoViewIfNeeded()
    await room.page.clock.runFor(1000)
    await expect.poll(emphasizedBars).toEqual([5])
  })

  test("chart の塊が種類ごとにグラフとして描かれる", async ({ run }) => {
    const room = await run.open({
      scenario: "report-chart",
      scene: "report-chart",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("plot の申告が棒・折れ線・円として、値と系列名つきで描かれる", async ({ run }) => {
    const room = await run.open({
      scenario: "report-plot-chart",
      scene: "report-plot-chart",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("plot の申告が数直線と bullet として描かれる", async ({ run }) => {
    const room = await run.open({
      scenario: "report-plot-gauge",
      scene: "report-plot-gauge",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("plot の申告が散布図とヒストグラムとして描かれる", async ({ run }) => {
    const room = await run.open({
      scenario: "plot-scatter-histogram",
      scene: "plot-scatter-histogram",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("レポートの本文の字を選ぶと口が出て、押すと入力欄の頭に引用が入ってフォーカスが移る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "report-selection-ask",
      scene: "notation",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    const paragraph = room.page.locator("[data-report-body] p").filter({ visible: true }).first()
    await paragraph.waitFor()
    await paragraph.click({ clickCount: 3 })

    const ask = room.page.getByRole("button", { name: "引いて聞く" })
    await ask.waitFor()
    await ask.click()

    const textArea = room.page.locator("textarea")
    await textArea.waitFor()
    await expect.poll(() => textArea.inputValue()).toMatch(/^> .+\n\n$/)
    await expect
      .poll(() => room.page.evaluate(() => document.activeElement?.tagName))
      .toBe("TEXTAREA")
    await ask.waitFor({ state: "hidden" })
  })

  test("札の幅が 48rem 未満ではやり取りの列が既定で畳まれ、開くを選ぶと読み込み直しても開いたまま、狭い画面（760px 以下）では列を出さない", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "report-outline-compact",
      scene: "long-report-quick",
      viewport: "compact",
      domRoots: ["turn-outline"],
    })

    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: "やり取りを開く" }).waitFor()
    await room.settleAndMatchPicked(ELAPSED_MS)

    await room.page.getByRole("button", { name: "やり取りを開く" }).click()
    await room.page.getByRole("button", { name: "やり取りを畳む" }).waitFor()
    await room.page.reload({ waitUntil: "domcontentloaded" })
    await room.page.getByRole("button", { name: "やり取りを畳む" }).waitFor()

    await room.resize(VIEWPORTS.narrow)
    await room.page.locator('nav[aria-label="やり取り"]').waitFor({ state: "hidden" })
  })

  test("やり取りの列の上の段にやり取りが結果の印つきで並び、やり取りの行で Enter を押すとそのやり取りへ移る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "report-turn-outline",
      scene: "turn-outline",
      viewport: "wide",
      domRoots: ["turn-outline"],
    })

    await room.waitForEvent("turn-finished", 5)
    await room.page.locator('nav[aria-label="やり取り"] [data-level="sub"]').waitFor()
    await room.settleAndMatchPicked(ELAPSED_MS)

    const firstRow = room.page.getByRole("button", {
      name: "完了: 指示をタスクにする（架空の依頼）",
    })
    await firstRow.focus()
    await room.page.keyboard.press("Enter")
    await room.page
      .locator('[data-outline-turn][aria-current="true"]', {
        hasText: "指示をタスクにする（架空の依頼）",
      })
      .waitFor()
    await room.page
      .locator("section", { has: room.page.getByRole("heading", { level: 2, name: "依頼" }) })
      .getByText("指示をタスクにする（架空の依頼）")
      .waitFor()
  })

  test("別のやり取りへ移って戻ると、読んでいた見出しが同じ位置にあり、初めて開くやり取りは先頭から見える", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "report-reading-position",
      scene: "reading-position",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished", 2)
    const heading = room.page.locator("h4", { hasText: "二の見出し2（架空）" }).filter({
      visible: true,
    })
    await heading.waitFor()
    await heading.evaluate((element) => {
      element.scrollIntoView({ block: "start" })
    })
    const topOf = (): Promise<number> =>
      heading.evaluate((element) => element.getBoundingClientRect().top)
    // 転がり終えて落ち着いた位置を控える（Scroll Anchoring で動くことがあるので値が止まるまで待つ）。
    await expect
      .poll(async () => {
        const first = await topOf()
        await room.page.waitForTimeout(100)
        return Math.abs((await topOf()) - first)
      })
      .toBeLessThan(1)
    const before = await topOf()
    // 凍らせた時計では rAF が進まないので、読み位置を測るフレームを進める。
    await room.page.clock.runFor(50)

    await room.page.getByRole("button", { name: "完了: 読み位置の一つ目（架空の依頼）" }).click()
    await room.page
      .locator("h4", { hasText: "一の見出し1（架空）" })
      .filter({ visible: true })
      .waitFor()
    const firstHeadingTop = await room.page
      .locator("h4", { hasText: "一の見出し1（架空）" })
      .filter({ visible: true })
      .evaluate((element) => element.getBoundingClientRect().top)
    expect(firstHeadingTop).toBeGreaterThan(0)

    await room.page.getByRole("button", { name: "完了: 読み位置の二つ目（架空の依頼）" }).click()
    await expect.poll(async () => Math.abs((await topOf()) - before)).toBeLessThanOrEqual(2)
  })
})
