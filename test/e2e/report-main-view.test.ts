import { describe, it } from "vitest"

import { useScenarioRun, VIEWPORTS } from "./scenario-run.ts"

// report → メインビュー（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// `report` ツールの呼び出しがメインビューの Markdown へどう出るかを、疑似セッションの場面で確かめる:
// `notation`（記法の一覧）、`report-chart`（グラフの塊。ベンダのスクリプトが描く）、
// `long-report-quick`（やり取りの列。札の幅で畳む）、
// `turn-outline`（やり取りの列の上の段のやり取りと結果の印）。

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
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("chart の塊が種類ごとにグラフとして描かれる", async () => {
    const room = await run.open({
      scenario: "report-chart",
      scene: "report-chart",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("札の幅が 48rem 未満ではやり取りの列が既定で畳まれ、開くを選ぶと読み込み直しても開いたまま、狭い画面（760px 以下）では列を出さない", async () => {
    const room = await run.open({
      scenario: "report-outline-compact",
      scene: "long-report-quick",
      viewport: "compact",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: "やり取りを開く" }).waitFor()
    await room.settleAndMatch(ELAPSED_MS)

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
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished", 5)
    await room.page.locator('nav[aria-label="やり取り"] [data-level="sub"]').waitFor()
    await room.settleAndMatch(ELAPSED_MS)

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
})
