import type { Locator } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"
import { openTaskListRoom, openTaskListRoomWithDraft } from "./task-room.ts"

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("タスクの一覧", () => {
  test("プレビューの「<名前> に頼む」から確認の「頼む」を押すと既定の文面で依頼が送られて確認とプレビューが閉じる", async ({
    run,
  }) => {
    const room = await openTaskListRoom(run, "task-list-run-executed", [
      "task-section",
      "task-run-confirm",
    ])
    await taskRow(room, "T-001").click()
    await room.page.getByRole("button", { name: /に頼む$/ }).click()
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "頼む", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    expect(await room.page.getByRole("dialog", { name: "タスクの実行" }).count()).toBe(0)
    expect(await room.page.getByRole("dialog", { name: "T-001 の詳細" }).count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })

  for (const size of [
    { width: 1400, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`${String(size.width)}x${String(size.height)} で行を押すとプレビューが画面の内に見える`, async ({
      run,
    }) => {
      const room = await openTaskListRoom(run, `task-list-peek-visible-${String(size.width)}`, [
        "task-section",
      ])
      await room.page.setViewportSize(size)
      await taskRow(room, "T-001").click()
      const peek = room.page.getByRole("dialog", { name: "T-001 の詳細" })
      await peek.waitFor()
      const box = await peek.boundingBox()
      expect(box).not.toBeNull()
      if (box === null) {
        return
      }
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(size.width)
      expect(box.y + box.height).toBeLessThanOrEqual(size.height)
    })
  }

  test("段「ドラフト」の行のプレビューの「計画する」から確認の「頼む」を押すと計画の文面で依頼が送られる", async ({
    run,
  }) => {
    const room = await openTaskListRoomWithDraft(run, "task-list-draft-plan", [
      "task-section",
      "task-run-confirm",
    ])
    await taskRow(room, "T-003").click()
    await room.page.getByRole("button", { name: "計画する", exact: true }).click()
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "頼む", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    expect(await room.page.getByRole("dialog", { name: "タスクの実行" }).count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })
})

/** 区画の行のボタン。名前は ID と題をつないだものになるので、DOM の id で当てる。 */
function taskRow(room: ScenarioRoom, id: string): Locator {
  return room.page.locator(`#task-row-${id}`)
}
