import { describe, expect, it } from "vitest"

import {
  recommendationCandidates,
  recommendationKey,
} from "../../../../src/server/recommendation/core/recommendation-candidate.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"

/** 候補に入れるタスクの上限（始め方の一覧に並べるカードの枚数）。 */
const TASK_CANDIDATE_LIMIT = 3

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
    status: taskStatusOfWord(status),
    dependencies,
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

describe("recommendationCandidates", () => {
  it("前回の続きを先頭に、着手できる未着手をおすすめの順に並べ、理由の材料を添える", () => {
    const items = [
      task("X-001", "done", []),
      { ...task("X-002", "todo", []), difficulty: "opus" as const, urgency: "high" as const },
      task("X-003", "todo", ["X-002"]),
      task("X-004", "hold", ["X-002"]),
      task("X-005", "todo", [], ["X-001"]),
      task("X-006", "done", [], ["X-005"]),
    ]

    expect(recommendationCandidates(knownTaskSummary(items))).toEqual([
      { kind: "resume" },
      {
        kind: "task",
        id: "X-002",
        summary: "架空のX-002",
        waitedBy: ["X-003"],
        difficulty: "opus",
        importance: "normal",
        urgency: "high",
        followsDoneWork: false,
      },
      {
        kind: "task",
        id: "X-005",
        summary: "架空のX-005",
        waitedBy: [],
        difficulty: undefined,
        importance: "normal",
        urgency: "normal",
        followsDoneWork: true,
      },
    ])
  })

  it("タスクの候補は、カードに並べる枚数までで切る", () => {
    const items = Array.from({ length: TASK_CANDIDATE_LIMIT + 2 }, (_, index) =>
      task(`X-${String(index + 100)}`, "todo", []),
    )

    expect(recommendationCandidates(knownTaskSummary(items))).toHaveLength(TASK_CANDIDATE_LIMIT + 1)
  })
})

describe("recommendationKey", () => {
  it("理由の材料が変われば印も変わる", () => {
    const before = recommendationCandidates(knownTaskSummary([task("X-002", "todo", [])]))
    const after = recommendationCandidates(
      knownTaskSummary([{ ...task("X-002", "todo", []), summary: "直した架空の要約" }]),
    )

    expect(recommendationKey(before)).not.toBe(recommendationKey(after))
  })

  it("カードに並ばないタスクが変わっても印は変わらない", () => {
    const top = Array.from({ length: TASK_CANDIDATE_LIMIT }, (_, index) =>
      task(`X-${String(index + 200)}`, "todo", []),
    )
    const before = recommendationCandidates(knownTaskSummary([task("X-100", "todo", []), ...top]))
    const after = recommendationCandidates(
      knownTaskSummary([{ ...task("X-100", "todo", []), summary: "直した架空の要約" }, ...top]),
    )

    expect(recommendationKey(before)).toBe(recommendationKey(after))
  })
})
