import { describe, expect, it } from "vitest"

import { stageTasks } from "../../../../../src/browser/features/task-board/domain/task-stage.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"
import { taskStatusOfWord } from "../../../../fixture/session-state.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物のタスクファイルは使わない）。

function taskOf(id: string, status?: string, waitingFor: readonly string[] = []): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status: taskStatusOfWord(status),
    dependencies: [],
    waitingFor,
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  }
}

describe("stageTasks", () => {
  it("6種の状態と状態なしの全件が、どれか1つの段にちょうど1回ずつ入る", () => {
    const items = [
      taskOf("X-001", "doing"),
      taskOf("X-002", "todo"),
      taskOf("X-003", "todo", ["X-009"]),
      taskOf("X-004", "hold"),
      taskOf("X-005", "draft"),
      taskOf("X-006", "done"),
      taskOf("X-007", "mystery"),
      taskOf("X-008"),
    ]

    const ids = stageTasks(items).flatMap((group) => group.tasks.map((task) => task.id))

    expect(ids.toSorted()).toEqual(items.map((task) => task.id).toSorted())
  })

  it("段は上から いま・つぎ・待ち・ドラフト・済み の順で、0件の段は出ない", () => {
    const groups = stageTasks([
      taskOf("X-001", "done"),
      taskOf("X-002", "draft"),
      taskOf("X-003", "hold"),
      taskOf("X-004", "todo"),
      taskOf("X-005", "doing"),
    ])
    expect(groups.map((group) => group.stage)).toEqual(["now", "next", "waiting", "draft", "done"])

    expect(stageTasks([taskOf("X-001", "todo")]).map((group) => group.stage)).toEqual(["next"])
  })

  it("済みの段だけ番号の降順で、ほかの段は渡された順のまま", () => {
    const groups = stageTasks([
      taskOf("X-002", "done"),
      taskOf("X-010", "done"),
      taskOf("X-001", "todo"),
      taskOf("X-003", "todo"),
    ])
    const byStage = new Map(groups.map((group) => [group.stage, group.tasks.map((t) => t.id)]))

    expect(byStage.get("done")).toEqual(["X-010", "X-002"])
    expect(byStage.get("next")).toEqual(["X-001", "X-003"])
  })
})
