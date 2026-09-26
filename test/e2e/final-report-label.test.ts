import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// 最終レポートの札（`docs/glossary.md`「最終レポート」）。疑似セッションの場面
// `background-task-interim-report` は、`report` ツールを2回呼んだあとに背景のタスクへ入り、
// `turn-finished` を挟んで `turn-resumed` する場面（`test/fixture/fake-session.json`）。
// 2回目の `report`（`fake-report-bg-interim-2`）は、背景のタスクが残っているあいだは
// 「いちばん新しい・中間でない本文」ではあるが、次の `report` でまだ中間レポートへ回るかもしれない
// ——背景のタスクが片付き、3回目の `report` が来て初めてラベルが確定する。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 場面が最後に `turn-finished` を流す回数（背景のタスクへ入る前 + 合図のあと）。 */
const FINAL_TURN_FINISHED_OCCURRENCE = 2

describe("最終レポートの札", () => {
  it("背景のタスクが残っているあいだは、あとから来た report にも札を立てない", async () => {
    const room = await run.open({
      scenario: "final-report-label-waiting",
      scene: "background-task-interim-report",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("背景のタスクが片付き、続きのターンも終われば札が立つ", async () => {
    const room = await run.open({
      scenario: "final-report-label-closed",
      scene: "background-task-interim-report",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished", FINAL_TURN_FINISHED_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
