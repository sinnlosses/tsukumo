import type { Locator } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun, type ScenarioRoom } from "./scenario-run.ts"
import { openTaskListRoom, openTaskListRoomWithDraft } from "./task-room.ts"

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクの一覧", () => {
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
    expect(await room.page.getByRole("dialog", { name: "タスクの実行" }).count()).toBe(0)
    expect(await room.page.getByRole("dialog", { name: "t-001 の詳細" }).count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })

  it("ドラフトのチップで絞り、のぞき窓の「計画する」から確認の「頼む」を押すと計画の文面で依頼が送られる", async () => {
    const room = await openTaskListRoomWithDraft(run, "task-list-draft-plan", [
      "task-section",
      "task-run-confirm",
    ])
    await room.page.getByRole("button", { name: "ドラフト 1", exact: true }).click()
    await taskRow(room, "t-003").click()
    await room.page.getByRole("button", { name: "計画する", exact: true }).click()
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "頼む", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    expect(await room.page.getByRole("dialog", { name: "タスクの実行" }).count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })
})

/** 区画の行（進行中のカード）のボタン。名前は ID と題をつないだものになるので、DOM の id で当てる。 */
function taskRow(room: ScenarioRoom, id: string): Locator {
  return room.page.locator(`#task-row-${id}`)
}
