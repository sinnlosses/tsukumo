import { describe, expect, it } from "vitest"

import {
  previousSessionOf,
  welcomeEntriesOf,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/welcome/domain/welcome-entries.ts"
import type { TaskSummaryItem } from "../../../../../../../../../../src/shared/repository/task-summary.ts"
import type { SessionChoice } from "../../../../../../../../../../src/shared/session/session-choice.ts"

function choice(sessionId: string, heading: string | undefined): SessionChoice {
  return { viewPort: 1, sessionId, lastModified: 0, startedAt: 0, heading }
}

function task(id: string, status: string, dependencies: readonly string[]): TaskSummaryItem {
  return {
    id,
    summary: `架空の${id}`,
    status,
    difficulty: "sonnet",
    loopable: "Y",
    dependencies,
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  }
}

const NO_TASKS = { kind: "known", items: [], runPrompt: "/next-task {id}" } as const

describe("前回のセッション", () => {
  it("いまのセッションを除いた先頭を選ぶ", () => {
    const sessions = [choice("now", "今"), choice("prev", "前")]
    expect(previousSessionOf(sessions, "now")?.sessionId).toBe("prev")
  })

  it("いまのセッションしか無ければ無い", () => {
    expect(previousSessionOf([choice("now", "今")], "now")).toBeUndefined()
  })
})

describe("迎える口に並べる口", () => {
  it("要約の残りがあれば続きの口になり、依頼の文は「前回の続き: 残り」", () => {
    const entries = welcomeEntriesOf(
      choice("prev", "架空の題"),
      "架空の作業。\n残り：架空の検証",
      NO_TASKS,
    )
    expect(entries.resume).toEqual([
      {
        key: "prev",
        label: "架空の題",
        detail: "残り：架空の検証",
        request: "前回の続き: 架空の検証",
      },
    ])
  })

  it("見出しが無ければ「（題なし）」", () => {
    const entries = welcomeEntriesOf(choice("prev", undefined), "残り：架空", NO_TASKS)
    expect(entries.resume[0]?.label).toBe("（題なし）")
  })

  it("要約が無い・残りが無いときは続きの口を出さない", () => {
    expect(welcomeEntriesOf(choice("prev", "題"), undefined, NO_TASKS).resume).toEqual([])
    expect(welcomeEntriesOf(choice("prev", "題"), "架空の作業。", NO_TASKS).resume).toEqual([])
    expect(welcomeEntriesOf(undefined, undefined, NO_TASKS).resume).toEqual([])
  })

  it("着手できる未着手だけを上から3件並べ、依存で止まるもの・済んだものは除く", () => {
    const entries = welcomeEntriesOf(undefined, undefined, {
      kind: "known",
      runPrompt: "/next-task {id}",
      items: [
        task("X-1", "done", []),
        task("X-2", "todo", ["X-3"]),
        task("X-3", "todo", []),
        task("X-4", "todo", ["X-1"]),
        task("X-5", "todo", []),
        task("X-6", "todo", []),
      ],
    })
    expect(entries.tasks.map((door) => door.request)).toEqual([
      "X-3 に着手して",
      "X-4 に着手して",
      "X-5 に着手して",
    ])
  })

  it("タスクが読めないときも空の帳面のときも、タスクの口は無い", () => {
    expect(welcomeEntriesOf(undefined, undefined, { kind: "unknown" }).tasks).toEqual([])
    expect(welcomeEntriesOf(undefined, undefined, NO_TASKS).tasks).toEqual([])
  })
})
