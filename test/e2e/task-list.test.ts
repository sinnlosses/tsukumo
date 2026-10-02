import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { openTaskListRoom, openTaskListRoomWithRunningTask } from "./task-room.ts"

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクの一覧", () => {
  it("main の develop/task/ を読み、サイドバーのタスク一覧に並ぶ", async () => {
    const room = await openTaskListRoom(run, "task-list", ["task-section"])
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("チップを押すとその状態だけに絞り、選んだチップにだけ aria-pressed が付く", async () => {
    const room = await openTaskListRoom(run, "task-list-filtered", ["task-section"])
    await room.page.getByRole("button", { name: "未着手 1" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("選んでいるチップをもう一度押すと全件に戻る", async () => {
    const room = await openTaskListRoom(run, "task-list-filtered-off", ["task-section"])
    const chip = room.page.getByRole("button", { name: "未着手 1" })
    await chip.click()
    await chip.click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("別のチップを押すと絞り込みが切り替わる", async () => {
    const room = await openTaskListRoom(run, "task-list-filtered-switched", ["task-section"])
    await room.page.getByRole("button", { name: "未着手 1" }).click()
    await room.page.getByRole("button", { name: "完了 1" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("claim した todo は進行中のカードで先頭に出て、残りはファイルの順のまま並ぶ", async () => {
    const room = await openTaskListRoomWithRunningTask(
      run,
      "task-list-running",
      ["task-section"],
      "wide",
    )
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("一覧のIDを押すと実行の確認が開く", async () => {
    const room = await openTaskListRoom(run, "task-list-run-confirm", [
      "task-section",
      "task-run-confirm",
    ])
    await room.page.getByRole("button", { name: "T-001", exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("済んだタスクのIDは押せる部品にしない", async () => {
    const room = await openTaskListRoom(run, "task-list-run-done", ["task-section"])
    await room.page.getByRole("button", { name: "T-001", exact: true }).waitFor()
    expect(await room.page.getByRole("button", { name: "T-002", exact: true }).count()).toBe(0)
  })

  it("確認の「実行する」を押すと /next-task <ID> が送られて確認が閉じる", async () => {
    const room = await openTaskListRoom(run, "task-list-run-executed", [
      "task-section",
      "task-run-confirm",
    ])
    await room.page.getByRole("button", { name: "T-001", exact: true }).click()
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("確認の「キャンセル」を押すと何も送らず確認だけ閉じる", async () => {
    const room = await openTaskListRoom(run, "task-list-run-cancel", [
      "task-section",
      "task-run-confirm",
    ])
    await room.page.getByRole("button", { name: "T-001", exact: true }).click()
    await room.page.getByRole("button", { name: "キャンセル", exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("確認を Esc で閉じても何も送らない", async () => {
    const room = await openTaskListRoom(run, "task-list-run-escape", [
      "task-section",
      "task-run-confirm",
    ])
    await room.page.getByRole("button", { name: "T-001", exact: true }).click()
    await room.page.keyboard.press("Escape")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("summary を Enter で押すと全文に折り返す", async () => {
    const room = await openTaskListRoom(run, "task-list-summary-expand", ["task-section"])
    const summaryToggle = room.page.getByRole("button", {
      name: "架空のタスク（未着手）",
      exact: true,
    })
    await summaryToggle.focus()
    await room.page.keyboard.press("Enter")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("もう一度押すと1行の「…」に戻る", async () => {
    const room = await openTaskListRoom(run, "task-list-summary-collapse", ["task-section"])
    const summaryToggle = room.page.getByRole("button", {
      name: "架空のタスク（未着手）",
      exact: true,
    })
    await summaryToggle.click()
    await summaryToggle.click()
    await room.settleAndMatch(ELAPSED_MS)
  })
})
