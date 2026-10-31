import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskDoingCount } from "../../../../../../src/browser/components/domain/sidebar/components/task-doing-count.tsx"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
  TaskSummaryStatus,
} from "../../../../../../src/shared/repository/task-summary.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session/session-state.ts"
import { knownTaskSummary } from "../../../../../fixture/session-state.ts"
import { putSession } from "../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

function renderCount(tasks: TaskSummaryResult): string {
  putSession({ ...INITIAL_SESSION_STATE, tasks })
  return render(<TaskDoingCount />).container.textContent
}

function taskOf(id: string, status: TaskSummaryStatus): TaskSummaryItem {
  return {
    id,
    summary: "架空の着手中",
    status,
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

describe("TaskDoingCount（柱の口の進行中の件数）", () => {
  it("タスクが読めないとき（.beads が無い）は件数を出さない", () => {
    expect(renderCount({ kind: "unknown" })).toBe("")
  })

  it("タスクが読めれば進行中の件数を出す", () => {
    expect(
      renderCount(knownTaskSummary([taskOf("X-001", { kind: "known", status: "doing" })])),
    ).toBe("1")
  })

  it("語彙に無い状態の語や状態の無い課題は進行中に数えない", () => {
    expect(
      renderCount(
        knownTaskSummary([
          taskOf("X-001", { kind: "known", status: "doing" }),
          taskOf("X-002", { kind: "other", raw: "in-progress" }),
          taskOf("X-003", { kind: "none" }),
        ]),
      ),
    ).toBe("1")
  })
})
