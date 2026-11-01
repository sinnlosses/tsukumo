import { test } from "./room-fixture.ts"
import { openTaskBoardRoom } from "./task-room.ts"

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("タスクのモーダル", () => {
  test("「一覧を見る」で開き、左の一覧の先頭を選んで右に本文を Markdown で描く", async ({
    run,
  }) => {
    const room = await openTaskBoardRoom(run, "task-board-open", ["task-board"])
    await room.settleAndMatchPicked(ELAPSED_MS)
  })
})
