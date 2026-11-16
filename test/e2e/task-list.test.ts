import type { Locator } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"
import { openTaskListRoom, openTaskListRoomWithDraft } from "./task-room.ts"

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 進行の帯の高さ（広い幅）。`conversation-layout.module.css` の `--layout-sheet-strip-height`。 */
const STRIP_HEIGHT = 40

test.describe("タスクの一覧", () => {
  test("サイドシートの「<名前> に頼む」から確認の「頼む」を押すと既定の文面で依頼が送られて確認とサイドシートが閉じる", async ({
    run,
  }) => {
    const room = await openTaskListRoom(run, "task-list-run-executed", [
      "task-section",
      "task-run-confirm",
    ])
    await taskRow(room, "T-001").click()
    await sheetOf(room)
      .getByRole("button", { name: /に頼む$/ })
      .click()
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "頼む", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    expect(await room.page.getByRole("dialog", { name: "タスクの実行" }).count()).toBe(0)
    expect(await sheetOf(room).count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })

  for (const size of [
    { width: 1400, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`${String(size.width)}x${String(size.height)} で行を押すとサイドシートが画面の内に開き、進行の帯と入力欄に重ならない`, async ({
      run,
    }) => {
      const room = await openTaskListRoom(run, `task-list-sheet-visible-${String(size.width)}`, [
        "task-section",
      ])
      await room.page.setViewportSize(size)
      await taskRow(room, "T-001").click()
      const sheet = room.page.getByRole("complementary", { name: "架空のタスク（未着手）" })
      await sheet.waitFor()
      const box = await boxOf(sheet)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(size.width)
      expect(box.y + box.height).toBeLessThanOrEqual(size.height)

      const main = await boxOf(room.page.locator('[data-region="main"]'))
      const dispatch = await boxOf(room.page.locator('[data-region="dispatch"]'))
      const sidebar = await boxOf(room.page.locator('[data-region="sidebar"]'))
      // 進行の帯はメインビューの上端に貼り付く高さ 40px の帯。帯の無い場面でも、その分は空けておく。
      expect(box.y).toBeGreaterThanOrEqual(main.y + STRIP_HEIGHT)
      expect(box.y + box.height).toBeLessThanOrEqual(dispatch.y)
      expect(box.x + box.width).toBeLessThanOrEqual(sidebar.x)
    })
  }

  test("段「ドラフト」の行のサイドシートの「計画する」から確認の「頼む」を押すと計画の文面で依頼が送られる", async ({
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

  test("探す欄に語を打つと段が絞られ、Enter で選んだ行のサイドシートが開き、Esc で語が消える", async ({
    run,
  }) => {
    const room = await openTaskListRoom(run, "task-list-search", ["task-section"])
    const field = room.page.getByRole("combobox", { name: "タスクを探す" })
    await field.fill("完了")
    await taskRow(room, "T-002").waitFor()
    expect(await taskRow(room, "T-001").count()).toBe(0)
    await field.press("Enter")
    await room.page.getByRole("complementary", { name: "架空のタスク（完了）" }).waitFor()
    await field.press("Escape")
    expect(await field.inputValue()).toBe("")
    await taskRow(room, "T-001").waitFor()
  })
})

/** 区画の行のボタン。名前は ID と題をつないだものになるので、DOM の id で当てる。 */
function taskRow(room: ScenarioRoom, id: string): Locator {
  return room.page.locator(`#task-row-${id}`)
}

/** サイドシート。サイドバーも `<aside>` なので、DOM の id で当てる。 */
function sheetOf(room: ScenarioRoom): Locator {
  return room.page.locator("#task-sheet")
}

async function boxOf(locator: Locator): Promise<{
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}> {
  const box = await locator.boundingBox()
  if (box === null) {
    throw new Error("矩形が取れない（描かれていない）")
  }
  return box
}
