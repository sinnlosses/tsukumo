import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// report → メインビュー（記法・差し戻し・整え。docs/design.md 10章「E2E のシナリオの一覧」）。
// `report` ツールの呼び出しがメインビューの Markdown へどう出るかを、疑似セッションの3つの場面で
// 確かめる: `notation`（記法の一覧）、`report-rejected`（差し戻されたレポートは描かれず、
// 直したレポートだけが残る）、`report-tidied`（整形で落ちる行は描かれず、残りはそのまま出る）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("report → メインビュー", () => {
  it("記法の一覧がメインビューに描かれる", async () => {
    const room = await run.open({
      scenario: "report-notation",
      scene: "notation",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("差し戻されたレポートは描かれず、直したレポートだけが残る", async () => {
    const room = await run.open({
      scenario: "report-rejected",
      scene: "report-rejected",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("整形で落ちる行は描かれず、残りはそのまま出る", async () => {
    const room = await run.open({
      scenario: "report-tidied",
      scene: "report-tidied",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
