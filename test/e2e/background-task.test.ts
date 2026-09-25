import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// 背景のタスク（docs/design.md 10章「E2E のシナリオの一覧」）。疑似セッションの場面
// `background-task-short` は、もとの `background-task`（再開まで12秒超）を再開まで数秒に
// 縮めた版——20秒級の場面を毎回待たずに、開始と再開の両方を1本の E2E の中で確かめられる
// ようにしてある。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** `background-task-short` が再開後に2回目の `turn-finished` を流す回数（開始 + 再開）。 */
const RESUMED_TURN_FINISHED_OCCURRENCE = 2

describe("背景のタスク", () => {
  it("背景で走らせた直後は、ターンが終わっても背景のタスクが残る", async () => {
    const room = await run.open({
      scenario: "background-task-running",
      scene: "background-task-short",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("背景の待ちが終わると turn-resumed で続きのターンが流れ、背景のタスクが消える", async () => {
    const room = await run.open({
      scenario: "background-task-resumed",
      scene: "background-task-short",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished", RESUMED_TURN_FINISHED_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
