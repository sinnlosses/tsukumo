import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 許可のモーダル（押すと answer が流れ、箱が消える。docs/design.md 10章「E2E のシナリオの
// 一覧」）。疑似セッションの場面 `permission` を名指しして起こし、答え待ちの箱（`pending-changed`
// で `kind: "permission"` が届く）が出たところで「許可」を押す。押したあとは
// 2回目の `pending-changed`（箱が消える。答えを消化した `pending-changed`）を待ってから撮る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("許可のモーダル", () => {
  it("許可を押すと answer が流れ、答え待ちの箱が消える", async () => {
    const room = await run.open({
      scenario: "permission-answer",
      scene: "permission",
      viewport: "wide",
    })

    await room.page.getByRole("button", { name: "許可" }).click()
    await room.waitForEvent("pending-changed", 2)
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
