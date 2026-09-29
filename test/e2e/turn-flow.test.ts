import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// ターンの流れ（依頼 → ツール → report → report の closing の締めのセリフ）。疑似セッションの場面 `report-tool` を
// 名指しして起こし、`turn-finished` が届いたところで画面の構造とメッセージの列を期待値と比べる
// （docs/architecture/testing.md「E2E のシナリオの一覧」）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("ターンの流れ", () => {
  it("依頼からツール・report・closing の締めのセリフまで流れ、メインビューとキャラビューに出る", async () => {
    const room = await run.open({
      scenario: "turn-flow",
      scene: "report-tool-quick",
      viewport: "wide",
      domRoots: ["page"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
