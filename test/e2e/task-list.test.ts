import type { Locator } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"
import {
  openTaskBoardFromWelcome,
  openTaskListRoom,
  openTaskListRoomWithDraft,
} from "./task-room.ts"

// 迎えるのサイドバーの入口で開くタスクのモーダルから頼む流れ（docs/architecture/testing.md「E2E のシナリオの一覧」）。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("タスクの一覧", () => {
  test("一覧で選んで「tsukumo に頼む」から確認の「実行する」を押すと既定の文面で依頼が送られて確認と一覧が閉じる", async ({
    run,
  }) => {
    const room = await openTaskListRoom(run, "task-list-run-executed", ["paper"])
    await openTaskBoardFromWelcome(room)
    await taskRow(room, "T-001").click()
    await board(room).getByRole("button", { name: "tsukumo に頼む" }).click()
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    expect(await room.page.getByRole("dialog", { name: "タスクの実行" }).count()).toBe(0)
    expect(await board(room).count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })

  test("サイドバーの一覧の行を選んで「依頼」を押すと、確認を挟まずに依頼が送られて働くの姿勢になる", async ({
    run,
  }) => {
    const room = await openTaskListRoom(run, "task-list-sidebar-request", ["sidebar"])
    const sidebar = room.page.locator('[data-region="sidebar"]')
    const row = sidebar.getByRole("option").filter({ hasText: "T-001" })
    await row.click()
    await sidebar.getByRole("button", { name: "依頼", exact: true }).click()

    await room.waitForEvent("request")
    expect(await room.page.getByRole("dialog", { name: "タスクの実行" }).count()).toBe(0)
    await expect(room.page.locator("[data-posture]").first()).toHaveAttribute(
      "data-posture",
      /^(work|deliver)$/,
    )
  })

  test("ドラフトのチップで絞り、「計画する」から確認の「頼む」を押すと計画の文面で依頼が送られる", async ({
    run,
  }) => {
    const room = await openTaskListRoomWithDraft(run, "task-list-draft-plan", ["paper"])
    await openTaskBoardFromWelcome(room)
    await board(room).getByRole("button", { name: "ドラフト 1", exact: true }).click()
    await taskRow(room, "T-003").click()
    await board(room).getByRole("button", { name: "計画する", exact: true }).click()
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "頼む", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    expect(await room.page.getByRole("dialog", { name: "タスクの実行" }).count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })
})

function board(room: ScenarioRoom): Locator {
  return room.page.getByRole("dialog", { name: "タスク" })
}

/** 一覧の行。名前は ID・状態・要約をつないだものになるので、ID で当てる。 */
function taskRow(room: ScenarioRoom, id: string): Locator {
  return board(room).getByRole("option").filter({ hasText: id })
}
