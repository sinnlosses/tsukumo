import { cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadTaskBody } from "../../../../src/browser/features/task-board/deferred-task-body.tsx"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import {
  isShown,
  OPEN_FIRST,
  renderSelectionBoard,
  searchBox,
  SELECTION_TASKS,
  selectionTask,
} from "./task-board-harness.tsx"

// タスクのモーダルの段の並び・開いたときの選択・持ち込む語・検索欄の Enter。
// フィクスチャはすべて手で書いた架空の課題。

beforeAll(async () => {
  await loadTaskBody()
})

afterEach(() => {
  cleanup()
})

describe("タスクのモーダルの段の並びと、開いたときの選択", () => {
  const STAGED_TASKS: readonly TaskSummaryItem[] = [
    selectionTask("X-001", "done", "架空の本文。\n"),
    selectionTask("X-002", "todo", "架空の本文。\n"),
    selectionTask("X-003", "doing", "架空の本文。\n"),
    selectionTask("X-004", "draft", "架空の本文。\n"),
    selectionTask("X-005", "hold", "架空の本文。\n"),
    selectionTask("X-006", "done", "架空の本文。\n"),
    selectionTask("X-007", "todo", "架空の本文。\n"),
  ]

  function optionIds(): readonly string[] {
    return screen
      .getAllByRole("option")
      .map((option) => option.id.replace("task-board-option-", ""))
  }

  it("行は いま・つぎ・待ち・ドラフト・済み の順で、済みは番号の降順", () => {
    renderSelectionBoard(STAGED_TASKS, OPEN_FIRST)

    expect(optionIds()).toEqual(["X-003", "X-002", "X-007", "X-005", "X-004", "X-006", "X-001"])
  })

  it("名指しが無ければ進行中の行、名指しで開けばそのタスクが選ばれている", () => {
    const board = renderSelectionBoard(STAGED_TASKS, OPEN_FIRST)
    expect(isShown("X-003")).toBe(true)

    board.rerenderWith(STAGED_TASKS, {
      kind: "open",
      focus: { kind: "task", id: "X-005" },
      query: "",
    })

    expect(isShown("X-005")).toBe(true)
  })

  it("↑↓ は段をまたいで表の順に動く", () => {
    renderSelectionBoard(STAGED_TASKS, OPEN_FIRST)
    const frame = document.querySelector(".task-board-frame") ?? document.body

    const visited = ["X-002", "X-007", "X-005", "X-004"].map((id) => {
      fireEvent.keyDown(frame, { key: "ArrowDown" })
      return isShown(id)
    })
    fireEvent.keyDown(frame, { key: "ArrowUp" })

    expect(visited).toEqual([true, true, true, true])
    expect(isShown("X-005")).toBe(true)
  })
})

describe("タスクのモーダルの検索欄の Enter", () => {
  const RUN_TASKS: readonly TaskSummaryItem[] = [
    selectionTask("X-001", "todo", "架空の本文。\n"),
    {
      ...selectionTask("X-002", "todo", "架空の本文。\n"),
      dependencies: ["X-001"],
      waitingFor: ["X-001"],
    },
    selectionTask("X-003", "draft", "架空の本文。\n"),
  ]

  function confirmDialog(): Element | null {
    return document.querySelector("dialog.task-run-confirm")
  }

  it("着手可のタスクを選んでいれば、頼む口の確認が開く", () => {
    renderSelectionBoard(RUN_TASKS, OPEN_FIRST)

    fireEvent.keyDown(searchBox(), { key: "Enter" })

    expect(confirmDialog()).not.toBeNull()
  })

  it("変換中の Enter では開かない", () => {
    renderSelectionBoard(RUN_TASKS, OPEN_FIRST)

    fireEvent.keyDown(searchBox(), { key: "Enter", isComposing: true })

    expect(confirmDialog()).toBeNull()
  })

  it.each(["X-002", "X-003"])("頼めない・口が2つのタスク（%s）では何も開かない", (id) => {
    renderSelectionBoard(RUN_TASKS, OPEN_FIRST)
    fireEvent.click(screen.getByRole("option", { name: new RegExp(id) }))

    fireEvent.keyDown(searchBox(), { key: "Enter" })

    expect(confirmDialog()).toBeNull()
  })
})

describe("タスクのモーダルへ持ち込む語", () => {
  it("語を載せて開くと検索欄に入り、一覧がその語で絞られている", () => {
    renderSelectionBoard(SELECTION_TASKS, {
      kind: "open",
      focus: { kind: "first" },
      query: "X-003",
    })

    expect(searchBox().value).toBe("X-003")
    expect(screen.getAllByRole("option").map((option) => option.id)).toEqual([
      "task-board-option-X-003",
    ])
  })

  it("名指しのタスクが語に当たらなければ、絞り込みの外の行で出る", () => {
    renderSelectionBoard(SELECTION_TASKS, {
      kind: "open",
      focus: { kind: "task", id: "X-002" },
      query: "X-003",
    })

    expect(isShown("X-002")).toBe(true)
    expect(screen.getByRole("option", { selected: true }).textContent).toContain("絞り込みの外")
  })
})
