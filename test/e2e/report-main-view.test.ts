import { describe, expect, it } from "vitest"

import { useScenarioRun, VIEWPORTS } from "./scenario-run.ts"

// report → メインビュー（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// `report` ツールの呼び出しがメインビューの Markdown へどう出るかを、疑似セッションの場面で確かめる:
// `notation`（記法の一覧）、`report-chart`（グラフの塊。ベンダのスクリプトが描く）、
// `long-report-quick`（やり取りの列。札の幅で畳む）、
// `turn-outline`（やり取りの列の上の段のやり取りと結果の印）、
// `reading-position`（別のやり取りへ移って戻ると読んでいた見出しの位置から見える）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("report → メインビュー", () => {
  it("記法の一覧がメインビューに描かれる", async () => {
    const room = await run.open({
      scenario: "report-notation",
      scene: "notation",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  it("chart の塊が種類ごとにグラフとして描かれる", async () => {
    const room = await run.open({
      scenario: "report-chart",
      scene: "report-chart",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  it("plot の申告が棒・折れ線・円として、値と系列名つきで描かれる", async () => {
    const room = await run.open({
      scenario: "report-plot-chart",
      scene: "report-plot-chart",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  it("plot の申告が数直線と bullet として描かれる", async () => {
    const room = await run.open({
      scenario: "report-plot-gauge",
      scene: "report-plot-gauge",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  it("plot の申告が散布図とヒストグラムとして描かれる", async () => {
    const room = await run.open({
      scenario: "plot-scatter-histogram",
      scene: "plot-scatter-histogram",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  it("レポートの本文の字を選ぶと口が出て、押すと入力欄の頭に引用が入ってフォーカスが移る", async () => {
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

  it("札の幅が 48rem 未満ではやり取りの列が既定で畳まれ、開くを選ぶと読み込み直しても開いたまま、狭い画面（760px 以下）では列を出さない", async () => {
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

  it("やり取りの列の上の段にやり取りが結果の印つきで並び、やり取りの行で Enter を押すとそのやり取りへ移る", async () => {
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

  it("別のやり取りへ移って戻ると、読んでいた見出しが同じ位置にあり、初めて開くやり取りは先頭から見える", async () => {
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
