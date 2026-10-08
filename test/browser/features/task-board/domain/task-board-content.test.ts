import { describe, expect, it } from "vitest"

import {
  boardContent,
  boardEntries,
  type BoardContentInput,
} from "../../../../../src/browser/features/task-board/domain/task-board-content.ts"
import { matchesFilter } from "../../../../../src/browser/features/task-board/domain/task-board-filter.ts"
import type {
  TaskBoardContent,
  TaskStateView,
} from "../../../../../src/browser/features/task-board/domain/task-board-view.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../../src/shared/repository/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

function taskOf(id: string, overrides: Partial<TaskSummaryItem>): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status: "todo",
    dependencies: [],
    waitingFor: [],
    labels: [],
    body: "",
    location: { kind: "none" },
    ...overrides,
  }
}

function statesOf(items: readonly TaskSummaryItem[]): readonly TaskStateView[] {
  return boardEntries(items).map((entry) => entry.state)
}

describe("boardEntries の状態の言い方", () => {
  it("依存の無い todo は着手できる", () => {
    expect(statesOf([taskOf("X-001", {})])).toEqual([{ kind: "ready", text: "着手できる" }])
  })

  it("済んでいない依存を持つ todo は待ちで、その ID を字に添える", () => {
    expect(
      statesOf([
        taskOf("X-001", {}),
        taskOf("X-002", { dependencies: ["X-001"], waitingFor: ["X-001"] }),
      ]).at(1),
    ).toEqual({ kind: "blocked", text: "待ち X-001" })
  })

  it("保留は待ちが残っていれば ID を添え、無ければ字だけ", () => {
    const states = statesOf([
      taskOf("X-001", {}),
      taskOf("X-002", { status: "hold", dependencies: ["X-001"], waitingFor: ["X-001"] }),
      taskOf("X-003", { status: "hold" }),
    ])
    expect(states.at(1)).toEqual({ kind: "hold", text: "保留 · X-001" })
    expect(states.at(2)).toEqual({ kind: "hold", text: "保留" })
  })

  it("進行中・完了・想定外の値はそれぞれの言い方になる", () => {
    expect(
      statesOf([
        taskOf("X-002", { status: "doing" }),
        taskOf("X-003", { status: "done" }),
        taskOf("X-005", { status: "archived" }),
        taskOf("X-006", { status: undefined }),
      ]),
    ).toEqual([
      { kind: "doing", text: "進行中" },
      { kind: "done", text: "完了" },
      { kind: "other", text: "archived" },
      { kind: "other", text: "—" },
    ])
  })
})

describe("boardContent", () => {
  const NO_BREADCRUMB: BoardContentInput = {
    query: "",
    filter: "all",
    destination: { kind: "present" },
    run: () => {},
    onJump: () => {},
    breadcrumb: { kind: "none" },
  }

  function contentOf(tasks: TaskSummaryResult, selectedId: string): TaskBoardContent {
    const items = tasks.kind === "known" ? tasks.items : []
    const entries = boardEntries(items)
    const byId = new Map(entries.map((entry) => [entry.task.id, entry]))
    return boardContent(
      tasks,
      entries,
      byId,
      entries,
      entries.find((entry) => entry.task.id === selectedId),
      (entry) => matchesFilter(entry.state, NO_BREADCRUMB.filter),
      new Set(items.map((item) => item.id)),
      NO_BREADCRUMB,
    )
  }

  function known(items: readonly TaskSummaryItem[]): TaskSummaryResult {
    return { kind: "known", items, runPrompt: "/next-task {id}" }
  }

  it("読み込み中は loading、読めないときは unknown、0件なら empty", () => {
    expect(contentOf({ kind: "loading" }, "")).toEqual({ kind: "loading" })
    expect(contentOf({ kind: "unknown" }, "")).toEqual({ kind: "unknown" })
    expect(contentOf(known([]), "")).toEqual({ kind: "empty" })
  })

  it("一覧を行と札へ畳み、選んだ行に印を付ける", () => {
    const content = contentOf(
      known([taskOf("X-001", {}), taskOf("X-002", { status: "done" })]),
      "X-001",
    )
    if (content.kind !== "known") {
      throw new Error("known のはず")
    }

    expect(content.rows.map((row) => [row.id, row.selected])).toEqual([
      ["X-001", true],
      ["X-002", false],
    ])
    expect(content.activeOptionId).toBe("task-board-option-X-001")
    expect(content.chips.map((chip) => [chip.filter, chip.count, chip.pressed])).toEqual([
      ["all", 2, true],
      ["ready", 1, false],
      ["blocked", 0, false],
      ["hold", 0, false],
      ["doing", 0, false],
      ["done", 1, false],
    ])
  })

  it("詳細に依存と依存元の札・置き場所の口・頼めるかを畳む", () => {
    const content = contentOf(
      known([
        taskOf("X-001", { status: "doing" }),
        taskOf("X-002", {
          dependencies: ["X-001", "X-999"],
          waitingFor: ["X-001"],
          location: { kind: "issue", url: "https://example.invalid/issues/2" },
        }),
        taskOf("X-003", { dependencies: ["X-002"], waitingFor: ["X-002"] }),
      ]),
      "X-002",
    )
    if (content.kind !== "known" || content.selection.kind !== "some") {
      throw new Error("選択があるはず")
    }
    const { detail, opener, run } = content.selection

    expect(detail.dependencies.map((card) => [card.kind, card.id])).toEqual([
      ["listed", "X-001"],
      ["unlisted", "X-999"],
    ])
    expect(detail.dependents.map((card) => card.id)).toEqual(["X-003"])
    expect(opener).toEqual({ kind: "issue", url: "https://example.invalid/issues/2" })
    expect(run).toEqual({ kind: "unavailable", reason: "待ちが終わると頼めます" })
  })

  it("詳細のラベルは labels の字のまま、無ければ空", () => {
    const tasks = known([
      taskOf("X-001", { labels: ["loopable:Y", "difficulty:sonnet"] }),
      taskOf("X-002", {}),
    ])
    const labelsOf = (id: string): readonly string[] | undefined => {
      const content = contentOf(tasks, id)
      return content.kind === "known" && content.selection.kind === "some"
        ? content.selection.detail.labels
        : undefined
    }

    expect([labelsOf("X-001"), labelsOf("X-002")]).toEqual([
      ["loopable:Y", "difficulty:sonnet"],
      [],
    ])
  })
})
