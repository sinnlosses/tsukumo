import { expect, test } from "./room-fixture.ts"
import { openTaskSheetRoom } from "./task-room.ts"

test.describe("タスクの紙", () => {
  test("↑↓ で選んで Enter で頼むと確認が出て、送ると紙が閉じる", async ({ run }) => {
    const room = await openTaskSheetRoom(run, "task-sheet-ask", ["page"], "wide")
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("ArrowUp")
    await room.page.keyboard.press("Enter")
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    expect(await room.page.getByRole("combobox", { name: "タスクを探す" }).count()).toBe(0)
  })
})
