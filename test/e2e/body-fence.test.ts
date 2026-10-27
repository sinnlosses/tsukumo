import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// report の `body`（Markdown と型つきフェンス）がメインビューに描かれる。
// 疑似セッションの場面 `body-fence-view` が、図 2・表 1・注意 1・コード 2 を出す。

const run = useScenarioRun()

const ELAPSED_MS = 60_000

describe("body → メインビュー", () => {
  it("本文の型つきフェンスが図・表・注意・コードとして描かれる", async () => {
    const room = await run.open({
      scenario: "body-fence-view",
      scene: "body-fence-view",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })
})
