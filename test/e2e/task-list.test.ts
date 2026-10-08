import type { Locator } from "playwright-core"
import { describe, it } from "vitest"

import { useScenarioRun, type ScenarioRoom } from "./scenario-run.ts"
import { openTaskListRoom } from "./task-room.ts"

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクの一覧", () => {
  it("Beads の課題を読み、サイドバーのタスク一覧に並ぶ", async () => {
    const room = await openTaskListRoom(run, "task-list", ["task-section"])
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("のぞき窓の「これを始める」から確認の「実行する」を押すと既定の文面で依頼が送られて確認とのぞき窓が閉じる", async () => {
    const room = await openTaskListRoom(run, "task-list-run-executed", [
      "task-section",
      "task-run-confirm",
    ])
    await taskRow(room, "t-001").click()
    await room.page.getByRole("button", { name: "これを始める →", exact: true }).click()
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})

/** 区画の行（進行中のカード）のボタン。名前は ID と題をつないだものになるので、DOM の id で当てる。 */
function taskRow(room: ScenarioRoom, id: string): Locator {
  return room.page.locator(`#task-row-${id}`)
}
