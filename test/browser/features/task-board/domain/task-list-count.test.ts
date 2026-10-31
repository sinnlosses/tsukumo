import { describe, expect, it } from "vitest"

import { taskListCounts } from "../../../../../src/browser/features/task-board/domain/task-list-count.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"
import { taskStatusOfWord } from "../../../../fixture/session-state.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物のタスクファイルは使わない）。

function taskOf(id: string, status: string): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status: taskStatusOfWord(status),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  }
}

describe("taskListCounts", () => {
  it("すべて・未完了・ドラフト・完了の順に、ドラフトは未完了に数えない", () => {
    const counts = taskListCounts([
      taskOf("X-001", "todo"),
      taskOf("X-002", "hold"),
      taskOf("X-003", "draft"),
      taskOf("X-004", "done"),
    ])

    expect(counts.map((item) => [item.status, item.label, item.count])).toEqual([
      ["all", "すべて", 4],
      ["open", "未完了", 2],
      ["draft", "ドラフト", 1],
      ["done", "完了", 1],
    ])
  })

  it("ドラフトが無くても0件でチップを出す", () => {
    expect(taskListCounts([taskOf("X-001", "todo")]).map((item) => item.count)).toEqual([
      1, 1, 0, 0,
    ])
  })
})
