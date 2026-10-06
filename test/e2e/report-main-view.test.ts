import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it } from "vitest"

import { fictionalPng } from "../../scripts/lib/fictional-png.ts"
import { useScenarioRun, VIEWPORTS } from "./scenario-run.ts"

// report → メインビュー（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// `report` ツールの呼び出しがメインビューの Markdown へどう出るかを、疑似セッションの場面で確かめる:
// `notation`（記法の一覧）、`report-chart`（グラフの塊。ベンダのスクリプトが描く）、
// `report-image`（画像の塊。cwd の画像を棚の経路で読む）、`long-report-quick`（目次。札の幅で畳む）。

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

  it("image の塊が画像として描かれ、無い画像は札になり、notes は画像か札の横に番号つきで並び、外部の URL は描かれない", async () => {
    const room = await run.open({
      scenario: "report-image",
      scene: "report-image",
      viewport: "wide",
      domRoots: ["main"],
    })
    mkdirSync(join(room.cwd, "report-image-fixture"))
    writeFileSync(join(room.cwd, "report-image-fixture", "after.png"), fictionalPng(8, 4))

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("札の幅が 48rem 未満では目次が既定で畳まれ、開くを選ぶと読み込み直しても開いたまま、狭い画面では目次の列が描かれない", async () => {
    const room = await run.open({
      scenario: "report-outline-compact",
      scene: "long-report-quick",
      viewport: "compact",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: "目次を開く" }).waitFor()
    await room.settleAndMatch(ELAPSED_MS)

    await room.page.getByRole("button", { name: "目次を開く" }).click()
    await room.page.getByRole("button", { name: "目次を畳む" }).waitFor()
    await room.page.reload({ waitUntil: "domcontentloaded" })
    await room.page.getByRole("button", { name: "目次を畳む" }).waitFor()

    await room.page.setViewportSize(VIEWPORTS.narrow)
    await room.page.locator('nav[aria-label="目次"]').waitFor({ state: "hidden" })
  })
})
