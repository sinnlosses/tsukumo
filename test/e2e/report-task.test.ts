import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { boardDialog, openReportTaskRoom } from "./task-room.ts"

// タスクの作業のレポート（`report` の `task`）の結論部。疑似セッションの場面
// `report-task-shipped` / `report-task-stopped` / `report-task-awaiting-answer` は、同じ架空のタスクを
// 3つの終わり方で閉じる（`test/fixture/fake-session.json`）。
// `report-task-verdict` は同じタスクを、すべて通った検証4件・お願い・節3つで閉じる。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクの作業のレポートの結論部", () => {
  it.each([
    ["report-task-shipped", "完了して main へ送った"],
    ["report-task-stopped", "止めたは描かない"],
    ["report-task-awaiting-answer", "答え待ち"],
    ["report-task-verdict", "完了して main へ送った"],
  ])("%s: 目録の1行（ラベル・タスクID・%s）と作業の名前の見出しが結論の上に出る", async (scene) => {
    const room = await openReportTaskRoom(run, scene, scene, ["main"])
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("合図の行に「お願い」の口は出ず、お願いの本文は末尾に出る", async () => {
    const room = await openReportTaskRoom(
      run,
      "report-task-verdict-favor",
      "report-task-verdict",
      [],
    )
    const region = room.page.locator('[data-region="main"]')
    const verdict = region.getByRole("group", { name: "検証結果" })

    expect(await verdict.getByRole("link").count()).toBe(0)

    const favorBox = await region.locator('[id="favor-fake-report-task-verdict"]').boundingBox()
    expect(favorBox).not.toBeNull()
  })

  it("すべて通った検証は判定の札が緑になり、右に全行の一覧がそのまま出る（畳まない）", async () => {
    const room = await openReportTaskRoom(
      run,
      "report-task-verdict-open",
      "report-task-verdict",
      [],
    )
    const verdict = room.page
      .locator('[data-region="main"]')
      .getByRole("group", { name: "検証結果" })
    const table = verdict.getByRole("table", { name: "検証結果" })

    await table.waitFor()
    expect(await table.getByRole("row").count()).toBe(4)
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
