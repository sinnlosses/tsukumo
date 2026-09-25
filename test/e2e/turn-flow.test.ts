import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// ターンの流れ（依頼 → ツール → report → 締めの speak）。疑似セッションの場面 `report-tool` を
// 名指しして起こし、`turn-finished` が届いたところで画面の構造とメッセージの列を期待値と比べる
// （docs/design.md 10章「E2E のシナリオの一覧」）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("ターンの流れ", () => {
  it("依頼からツール・report・締めの speak まで流れ、メインビューとキャラビューに出る", async () => {
    const room = await run.open({ scenario: "turn-flow", scene: "report-tool", viewport: "wide" })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
