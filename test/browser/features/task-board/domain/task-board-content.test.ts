import { describe, expect, it } from "vitest"

import {
  boardContent,
  boardEntries,
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
import { knownTaskSummary, taskStatusOfWord } from "../../../../fixture/session-state.ts"

type BoardContentInput = Parameters<typeof boardContent>[7]

// フィクスチャはすべて手で書いた架空のタスク（実物のタスクファイルは使わない）。

function taskOf(id: string, overrides: Partial<TaskSummaryItem>): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status: taskStatusOfWord("todo"),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
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
      taskOf("X-002", {
        status: taskStatusOfWord("hold"),
        dependencies: ["X-001"],
        waitingFor: ["X-001"],
      }),
      taskOf("X-003", { status: taskStatusOfWord("hold") }),
    ])
    expect(states.at(1)).toEqual({ kind: "hold", text: "保留 · X-001" })
    expect(states.at(2)).toEqual({ kind: "hold", text: "保留" })
  })

  it("ドラフトは todo・hold と別の言い方になる", () => {
    expect(statesOf([taskOf("X-001", { status: taskStatusOfWord("draft") })])).toEqual([
      { kind: "draft", text: "ドラフト" },
    ])
  })

  it("進行中・完了・想定外の値はそれぞれの言い方になる", () => {
    expect(
      statesOf([
        taskOf("X-002", { status: taskStatusOfWord("doing") }),
        taskOf("X-003", { status: taskStatusOfWord("done") }),
        taskOf("X-005", { status: taskStatusOfWord("archived") }),
        taskOf("X-006", { status: taskStatusOfWord(undefined) }),
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
    run: () => {},
    onJump: () => {},
    breadcrumb: { kind: "none" },
    sort: { choices: {}, reasons: {} },
    onSortChoose: () => {},
    onSortReason: () => {},
    onSortReset: () => {},
    onSortRequest: () => {},
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
    return knownTaskSummary(items)
  }

  it("読み込み中は loading、読めないときは unknown、0件なら empty", () => {
    expect(contentOf({ kind: "loading" }, "")).toEqual({ kind: "loading" })
    expect(contentOf({ kind: "unknown" }, "")).toEqual({ kind: "unknown" })
    expect(contentOf(known([]), "")).toEqual({ kind: "empty" })
  })

  it("一覧を行と札へ畳み、選んだ行に印を付ける", () => {
    const content = contentOf(
      known([taskOf("X-001", {}), taskOf("X-002", { status: taskStatusOfWord("done") })]),
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
      ["draft", 0, false],
      ["doing", 0, false],
      ["done", 1, false],
    ])
  })

  it("絞り込み「ドラフト」のドラフトの行にだけ仕分けを出し、選びがあれば帯に件数を出す", () => {
    const tasks = known([
      taskOf("X-001", { status: taskStatusOfWord("draft") }),
      taskOf("X-002", { status: taskStatusOfWord("draft") }),
      taskOf("X-003", {}),
    ])
    const entries = boardEntries(tasks.kind === "known" ? tasks.items : [])
    const build = (input: BoardContentInput): TaskBoardContent =>
      boardContent(
        tasks,
        entries,
        new Map(entries.map((entry) => [entry.task.id, entry])),
        entries,
        entries[0],
        () => true,
        new Set(["X-001", "X-002", "X-003"]),
        input,
      )

    const all = build(NO_BREADCRUMB)
    if (all.kind !== "known") {
      throw new Error("known のはず")
    }
    expect(all.rows.map((row) => row.sort.kind)).toEqual(["none", "none", "none"])
    expect(all.sortBand).toEqual({ kind: "none" })

    const drafts = build({ ...NO_BREADCRUMB, filter: "draft" })
    if (drafts.kind !== "known") {
      throw new Error("known のはず")
    }
    expect(drafts.rows.map((row) => row.sort.kind)).toEqual(["some", "some", "none"])
    expect(drafts.sortBand).toEqual({ kind: "none" })

    const sorted = build({
      ...NO_BREADCRUMB,
      filter: "draft",
      sort: { choices: { "X-001": "plan" }, reasons: {} },
    })
    if (sorted.kind !== "known") {
      throw new Error("known のはず")
    }
    expect(sorted.rows[0]?.sort).toMatchObject({ kind: "some", choice: "plan" })
    expect(sorted.rows[1]?.sort).toMatchObject({ kind: "some", choice: "hold" })
    expect(sorted.sortBand).toMatchObject({
      kind: "some",
      planCount: 1,
      dropCount: 0,
      holdCount: 1,
    })
  })

  it("詳細に依存と依存元の札・置き場所の口・頼めるかを畳む", () => {
    const content = contentOf(
      known([
        taskOf("X-001", { status: taskStatusOfWord("doing") }),
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

  it("ドラフトの詳細では「計画する」「却下する」の口を返す", () => {
    const content = contentOf(
      known([taskOf("X-001", { status: taskStatusOfWord("draft") })]),
      "X-001",
    )
    if (content.kind !== "known" || content.selection.kind !== "some") {
      throw new Error("選択があるはず")
    }

    expect(content.selection.run.kind).toBe("draft")
  })

  it("詳細に属性が写る", () => {
    const tasks = known([
      taskOf("X-001", { difficulty: "haiku", loopable: "N" }),
      taskOf("X-002", {}),
    ])
    const attributesOf = (id: string): readonly unknown[] => {
      const content = contentOf(tasks, id)
      return content.kind === "known" && content.selection.kind === "some"
        ? [content.selection.detail.difficulty, content.selection.detail.loopable]
        : []
    }

    expect([attributesOf("X-001"), attributesOf("X-002")]).toEqual([
      ["haiku", "N"],
      [undefined, undefined],
    ])
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
