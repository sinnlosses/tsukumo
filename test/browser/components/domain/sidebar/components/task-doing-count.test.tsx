import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TaskDoingCount } from "../../../../../../src/browser/components/domain/sidebar/components/task-doing-count.tsx"
import type { TaskSummaryResult } from "../../../../../../src/shared/repository/task-summary.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

function renderCount(tasks: TaskSummaryResult): string {
  putSession({ ...INITIAL_SESSION_STATE, tasks })
  return render(<TaskDoingCount />).container.textContent
}

describe("TaskDoingCount（柱の口の進行中の件数）", () => {
  it("タスクが読めないとき（.beads が無い）は件数を出さない", () => {
    expect(renderCount({ kind: "unknown" })).toBe("")
  })

  it("タスクが読めれば進行中の件数を出す", () => {
    expect(
      renderCount({
        kind: "known",
        items: [
          {
            id: "X-001",
            summary: "架空の着手中",
            status: "doing",
            dependencies: [],
            waitingFor: [],
            assignee: undefined,
            body: "",
            location: { kind: "none" },
          },
        ],
        runPrompt: "/next-task {id}",
      }),
    ).toBe("1")
  })
})
