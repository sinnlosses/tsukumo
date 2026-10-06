import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { openReportTaskRoom } from "./task-room.ts"

// タスクの作業のレポート（`report` の `task`）の結論部。疑似セッションの場面
// `report-task-shipped` は、架空のタスクを完了して main へ送った終わり方で閉じる（`test/fixture/fake-session.json`）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクの作業のレポートの結論部", () => {
  it("目録の1行（ラベル・タスクID・完了して main へ送った）と作業の名前の見出しが結論の上に出る", async () => {
    const room = await openReportTaskRoom(run, "report-task-shipped", "report-task-shipped", [
      "main",
    ])
    await room.settleAndMatch(ELAPSED_MS)
  })
})
