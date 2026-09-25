import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// 続きのターン（`turn-resumed`。docs/design.md 10章「E2E のシナリオの一覧」）。疑似セッションの
// 場面 `resumed-report` は、合図（`turn-resumed`）をまたいで3回続くやり取りの中間レポートが
// 消えず、最後に最終レポートへ差し替わることを見るための場面。`turn-finished` が4回
// （中間レポート → 合図 → 合図 → 最終レポート）届くまで待ってから撮る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** `resumed-report` が最後に `turn-finished` を流す回数（中間3回 + 最終1回）。 */
const FINAL_TURN_FINISHED_OCCURRENCE = 4

describe("続きのターン", () => {
  it("turn-resumed をまたいでも中間レポートが残り、最後に最終レポートへ差し替わる", async () => {
    const room = await run.open({
      scenario: "turn-resumed",
      scene: "resumed-report",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished", FINAL_TURN_FINISHED_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
