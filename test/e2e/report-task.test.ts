import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { boardDialog, openReportTaskRoom } from "./task-room.ts"

// タスクの作業のレポート（`report` の `task`）の結論部。疑似セッションの場面
// `report-task-shipped` / `report-task-stopped` / `report-task-awaiting-answer` は、同じ架空のタスクを
// 3つの終わり方で閉じる（`test/fixture/fake-session.json`）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクの作業のレポートの結論部", () => {
  it.each([
    ["report-task-shipped", "完了して main へ送った"],
    ["report-task-stopped", "止めた"],
    ["report-task-awaiting-answer", "答え待ち"],
  ])("%s: 目録の1行（ラベル・タスクID・%s）と作業の名前の見出しが結論の上に出る", async (scene) => {
    const room = await openReportTaskRoom(run, scene, scene, ["main"])
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("目録のタスクID を押すと、そのタスクを選んだタスクのモーダルが開く", async () => {
    const room = await openReportTaskRoom(run, "report-task-open", "report-task-shipped", [
      "task-board",
    ])
    await room.page
      .locator('[data-region="main"]')
      .getByRole("button", { name: "T-002", exact: true })
      .click()
    await boardDialog(room).waitFor()
    await room.settleAndMatch(ELAPSED_MS)
  })
})
