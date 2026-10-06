import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { openTaskBoardRoom } from "./task-room.ts"

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクのモーダル", () => {
  it("「一覧を見る」で開き、左の一覧の先頭を選んで右に本文を Markdown で描く", async () => {
    const room = await openTaskBoardRoom(run, "task-board-open", ["task-board"])
    await room.settleAndMatch(ELAPSED_MS)
  })
})
