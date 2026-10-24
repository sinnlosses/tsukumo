import { describe, expect, it } from "vitest"

import {
  recommendationCandidates,
  recommendationKey,
} from "../../../../src/server/recommendation/core/recommendation-candidate.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"

/** 問い合わせに渡すタスクの候補の上限。 */
const TASK_CANDIDATE_LIMIT = 20

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

    expect(recommendationCandidates(knownTaskSummary(items))).toEqual({
      candidates: [
        { kind: "resume" },
        { kind: "task", id: "X-002", summary: "架空のX-002", waitedBy: ["X-003", "X-004"] },
        { kind: "task", id: "X-005", summary: "架空のX-005", waitedBy: [] },
      ],
      omittedCount: 0,
    })
  })

  it("タスクの候補は上限で切り、切った件数を返す", () => {
    const items = Array.from({ length: TASK_CANDIDATE_LIMIT + 3 }, (_, index) =>
      task(`X-${String(index + 100)}`, "todo", []),
    )

    const selection = recommendationCandidates(knownTaskSummary(items))

    expect(selection.candidates).toHaveLength(TASK_CANDIDATE_LIMIT + 1)
    expect(selection.omittedCount).toBe(3)
  })

  it("上限ちょうどでは切らない", () => {
    const items = Array.from({ length: TASK_CANDIDATE_LIMIT }, (_, index) =>
      task(`X-${String(index + 100)}`, "todo", []),
    )

    expect(recommendationCandidates(knownTaskSummary(items)).omittedCount).toBe(0)
  })
})

describe("recommendationKey", () => {
  it("要約が変われば印も変わる", () => {
    const before = recommendationCandidates(knownTaskSummary([task("X-002", "todo", [])]))
    const after = recommendationCandidates(
      knownTaskSummary([{ ...task("X-002", "todo", []), summary: "直した架空の要約" }]),
    )

    expect(recommendationKey(before)).not.toBe(recommendationKey(after))
  })

  it("切っていなければ印は候補の並びだけで決まり、切ったときだけ件数が印に入る", () => {
    const { candidates } = recommendationCandidates(knownTaskSummary([task("X-002", "todo", [])]))

    expect(recommendationKey({ candidates, omittedCount: 0 })).toBe(JSON.stringify(candidates))
    expect(recommendationKey({ candidates, omittedCount: 2 })).not.toBe(
      recommendationKey({ candidates, omittedCount: 3 }),
    )
  })
})
