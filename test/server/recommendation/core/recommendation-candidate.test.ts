import { describe, expect, it } from "vitest"

import {
  RECOMMENDATION_TASK_CANDIDATE_LIMIT,
  recommendationCandidates,
  recommendationKey,
} from "../../../../src/server/recommendation/core/recommendation-candidate.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"

// すべて手で書いた架空のタスク一覧。

function task(
  id: string,
  status: string,
  waitingFor: readonly string[],
  dependencies: readonly string[] = waitingFor,
): TaskSummaryItem {
  return {
    id,
    summary: `架空の${id}`,
    status,
    dependencies,
    waitingFor,
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  }
}

describe("recommendationCandidates", () => {
  it("前回の続きを先頭に、着手できる未着手だけを一覧の順に並べ、待っている未完了のタスクを添える", () => {
    const items = [
      task("X-001", "done", []),
      task("X-002", "todo", []),
      task("X-003", "todo", ["X-002"]),
      task("X-004", "hold", ["X-002"]),
      task("X-005", "todo", [], ["X-001"]),
      task("X-006", "done", [], ["X-005"]),
    ]

    expect(recommendationCandidates({ kind: "known", items, runPrompt: "{id}" })).toEqual([
      { kind: "resume" },
      { kind: "task", id: "X-002", summary: "架空のX-002", waitedBy: ["X-003", "X-004"] },
      { kind: "task", id: "X-005", summary: "架空のX-005", waitedBy: [] },
    ])
  })

  it("設定が読めないときは前回の続きだけ", () => {
    expect(recommendationCandidates({ kind: "settings-invalid" })).toEqual([{ kind: "resume" }])
  })

  it("タスクの候補は上限で切る", () => {
    const items = Array.from({ length: RECOMMENDATION_TASK_CANDIDATE_LIMIT + 1 }, (_, index) =>
      task(`X-${String(index + 100)}`, "todo", []),
    )

    expect(recommendationCandidates({ kind: "known", items, runPrompt: "{id}" })).toHaveLength(
      RECOMMENDATION_TASK_CANDIDATE_LIMIT + 1,
    )
  })
})

describe("recommendationKey", () => {
  it("要約が変われば印も変わる", () => {
    const before = recommendationCandidates({
      kind: "known",
      items: [task("X-002", "todo", [])],
      runPrompt: "{id}",
    })
    const after = recommendationCandidates({
      kind: "known",
      items: [{ ...task("X-002", "todo", []), summary: "直した架空の要約" }],
      runPrompt: "{id}",
    })

    expect(recommendationKey(before)).toBe(recommendationKey([...before]))
    expect(recommendationKey(before)).not.toBe(recommendationKey(after))
  })
})
