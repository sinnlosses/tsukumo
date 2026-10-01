import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// report → メインビュー（記法・差し戻し・整え。docs/architecture/testing.md「E2E のシナリオの一覧」）。
// `report` ツールの呼び出しがメインビューの Markdown へどう出るかを、疑似セッションの5つの場面で
// 確かめる（`report-matrix` は対応表の塊）: `notation`（記法の一覧）、`report-rejected`（差し戻されたレポートは描かれず、
// 直したレポートだけが残る）、`report-tidied`（整形で落ちる行は描かれず、残りはそのまま出る）、
// `report-blocks`（候補の比較と触ったファイルの一覧の塊）、`report-chart`（棒・折れ線・円の
// グラフの塊）。

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

  it("差し戻されたレポートは描かれず、直したレポートだけが残る", async () => {
    const room = await run.open({
      scenario: "report-rejected",
      scene: "report-rejected-quick",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("整形で落ちる行は描かれず、残りはそのまま出る", async () => {
    const room = await run.open({
      scenario: "report-tidied",
      scene: "report-tidied",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("候補の比較は書いた順のカードに判定の語が付き、触ったファイルは1行ずつ種別の語とパスで出る", async () => {
    const room = await run.open({
      scenario: "report-blocks",
      scene: "report-blocks",
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

  it("matrix の塊が印と aria-label と凡例つきの格子として描かれる", async () => {
    const room = await run.open({
      scenario: "report-matrix",
      scene: "report-matrix",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
