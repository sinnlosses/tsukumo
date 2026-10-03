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

  it("合図の行の「お願い」を押すと、経路の hash を変えずにお願いの塊まで転がる", async () => {
    const room = await openReportTaskRoom(
      run,
      "report-task-verdict-favor",
      "report-task-verdict",
      [],
    )
    const region = room.page.locator('[data-region="main"]')
    const hashBefore = await room.page.evaluate(() => window.location.hash)

    await region.getByRole("group", { name: "検証とお願いの合図" }).getByRole("link").click()

    const regionBox = await region.boundingBox()
    const favorBox = await region.locator('[id="favor-fake-report-task-verdict"]').boundingBox()
    expect(regionBox).not.toBeNull()
    expect(favorBox).not.toBeNull()
    if (regionBox !== null && favorBox !== null) {
      expect(favorBox.y).toBeGreaterThanOrEqual(regionBox.y)
      expect(favorBox.y).toBeLessThan(regionBox.y + regionBox.height)
    }
    expect(await room.page.evaluate(() => window.location.hash)).toBe(hashBefore)
  })

  it("すべて通った検証は総括の1行に畳まれ、押すと行の表が開く", async () => {
    const room = await openReportTaskRoom(
      run,
      "report-task-verdict-open",
      "report-task-verdict",
      [],
    )
    const verdict = room.page
      .locator('[data-region="main"]')
      .getByRole("group", { name: "検証とお願いの合図" })
    const table = verdict.getByRole("table", { name: "検証結果" })

    expect(await table.isVisible()).toBe(false)
    await verdict.locator("summary").click()
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
