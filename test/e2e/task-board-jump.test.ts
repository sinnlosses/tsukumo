import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { boardDialog, boardOption, openTaskBoardJumpRoom } from "./task-room.ts"

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクのモーダル（つながりをたどる）", () => {
  it("本文中の ID を押すと詳細が切り替わり、一覧の選択も追いかける（語の途中・フェンスの中・一覧に無い ID は押せない）", async () => {
    const room = await openTaskBoardJumpRoom(run, "task-board-jump-body")
    await boardDialog(room)
      .locator('article[aria-label="本文"]')
      .getByRole("link", { name: "T-002", exact: true })
      .first()
      .click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("パンくずの「戻る」を押すと直前のタスクへ戻り、一覧で別の行を選ぶとパンくずが消える", async () => {
    const room = await openTaskBoardJumpRoom(run, "task-board-jump-back")
    await boardDialog(room)
      .locator('article[aria-label="本文"]')
      .getByRole("link", { name: "T-002", exact: true })
      .first()
      .click()
    await boardDialog(room).getByRole("button", { name: "T-001 に戻る" }).click()
    await boardOption(room, "T-003").click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("Alt+← でもパンくずの「戻る」と同じ場所へ戻る", async () => {
    const room = await openTaskBoardJumpRoom(run, "task-board-jump-back-alt-left")
    await boardDialog(room)
      .locator('article[aria-label="本文"]')
      .getByRole("link", { name: "T-002", exact: true })
      .first()
      .click()
    await room.page.keyboard.press("Alt+ArrowLeft")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("「先に終わっていてほしいもの」「これを待っているもの」の札を押すと行き来できる", async () => {
    const room = await openTaskBoardJumpRoom(run, "task-board-jump-dependency")
    await boardOption(room, "T-002").click()
    await boardDialog(room)
      .getByRole("group", { name: "先に終わっていてほしいもの" })
      .getByRole("button", { name: /T-001/ })
      .click()
    await boardDialog(room)
      .getByRole("group", { name: "これを待っているもの" })
      .getByRole("button", { name: /T-002/ })
      .click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("飛んだ先が絞り込みの外にあるときは、一覧にその行だけ「絞り込みの外」を添えて一時的に出す", async () => {
    const room = await openTaskBoardJumpRoom(run, "task-board-jump-out-of-filter")
    await boardOption(room, "T-004").click()
    await boardDialog(room).getByRole("button", { name: "保留 1" }).click()
    await boardDialog(room)
      .locator('article[aria-label="本文"]')
      .getByRole("link", { name: "T-001", exact: true })
      .click()
    await room.settleAndMatch(ELAPSED_MS)
  })
})
