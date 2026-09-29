import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { boardDialog, openTaskBoardRoom } from "./task-room.ts"

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクのモーダル", () => {
  it("「一覧を見る」で開き、左の一覧の先頭を選んで右に本文を Markdown で描く", async () => {
    const room = await openTaskBoardRoom(run, "task-board-open", ["task-board"])
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("↓ で行を移ると詳細が切り替わる（待ちのタスクは依存の札を並べ、頼めない理由を添える）", async () => {
    const room = await openTaskBoardRoom(run, "task-board-arrow", ["task-board"])
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("ArrowDown")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("検索は本文も引き、当たった行を選ぶ", async () => {
    const room = await openTaskBoardRoom(run, "task-board-search", ["task-board"])
    await boardDialog(room).getByRole("combobox", { name: "タスクを探す" }).fill("保留の理由")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("絞り込みの札を押すとその状態だけに絞る", async () => {
    const room = await openTaskBoardRoom(run, "task-board-filter", ["task-board"])
    await boardDialog(room).getByRole("button", { name: "進行中 1" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("検索と絞り込みは組み合わさり、当たらなければその旨を出して詳細を空にする", async () => {
    const room = await openTaskBoardRoom(run, "task-board-filter-search-empty", ["task-board"])
    await boardDialog(room).getByRole("button", { name: "待ち 1" }).click()
    await boardDialog(room).getByRole("combobox", { name: "タスクを探す" }).fill("完了")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("「tsukumo に頼む」から確認を通すと /next-task <ID> が送られ、モーダルも閉じる", async () => {
    const room = await openTaskBoardRoom(run, "task-board-run", ["task-board", "task-run-confirm"])
    await boardDialog(room).getByRole("button", { name: "tsukumo に頼む" }).click()
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("狭い画面でも同じ中身を2列を縦に積んで出す", async () => {
    const room = await openTaskBoardRoom(run, "task-board-narrow", ["task-board"], "narrow")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
