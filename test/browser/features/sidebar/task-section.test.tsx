import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { TaskSection } from "../../../../src/browser/features/sidebar/task-section.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session-state.ts"
import { type TaskSummaryResult } from "../../../../src/shared/task-summary.ts"
import { sessionStoreWith } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

afterEach(() => {
  cleanup()
})

const TASKS: TaskSummaryResult = {
  kind: "known",
  items: [
    {
      id: "X-001",
      summary: "架空の1件目",
      status: "todo",
      difficulty: "sonnet",
      loopable: "Y",
      dependencies: [],
    },
  ],
}

const MIXED_TASKS: TaskSummaryResult = {
  kind: "known",
  items: [
    {
      id: "X-001",
      summary: "架空の未着手",
      status: "todo",
      difficulty: "sonnet",
      loopable: "Y",
      dependencies: [],
    },
    {
      id: "X-002",
      summary: "架空の進行中",
      status: "doing",
      difficulty: "sonnet",
      loopable: "Y",
      dependencies: [],
    },
    {
      id: "X-003",
      summary: "架空の完了",
      status: "done",
      difficulty: "sonnet",
      loopable: "Y",
      dependencies: [],
    },
  ],
}

function renderTaskSection(tasks: TaskSummaryResult): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, tasks })
  render(
    <SessionStoreContext.Provider value={store}>
      <TaskSection />
    </SessionStoreContext.Provider>,
  )
}

/**
 * 区画（`<section>`）だけを見る。表のモーダルは閉じていても木に居るので、同じ字が2つある。
 * `<section>` は名前が無いと role を持たないので、見出しから親をたどる。
 */
function inSection(): ReturnType<typeof within> {
  const section = screen.getByRole("heading", { level: 2 }).closest("section")
  if (section === null) {
    throw new Error("区画の <section> が無い")
  }
  return within(section)
}

/** 開いているかどうかは `<dialog>` の `open` 属性で見る（`task-board.test.tsx` と同じ見方）。 */
function boardIsOpen(): boolean {
  return document.querySelector("dialog.task-board")?.hasAttribute("open") === true
}

describe("TaskSection", () => {
  it("見出しの文言と区画の中身を出す", () => {
    renderTaskSection(TASKS)

    expect(inSection().getByText("タスク")).toBeDefined()
    expect(inSection().getByText("架空の1件目")).toBeDefined()
  })

  it("見出しの下に件数のチップを出す（進行中 → 未着手 → 完了。0件も出す）", () => {
    renderTaskSection(TASKS)

    const chips = inSection()
      .getAllByRole("listitem")
      .filter((item: HTMLElement) => item.className.includes("task-count-chip"))
    expect(chips.map((chip: HTMLElement) => chip.textContent)).toEqual([
      "進行中 0",
      "未着手 1",
      "完了 0",
    ])
  })

  it("見出しの「一覧を見る」で表が開く", () => {
    renderTaskSection(TASKS)
    expect(boardIsOpen()).toBe(false)

    fireEvent.click(inSection().getByRole("button", { name: "一覧を見る" }))

    expect(boardIsOpen()).toBe(true)
  })

  it("タスクが読めていないときも区画は消えない（チップは出ない）", () => {
    renderTaskSection({ kind: "unknown" })

    expect(inSection().getByText("タスク")).toBeDefined()
    expect(inSection().getByText("不明")).toBeDefined()
    expect(
      inSection()
        .queryAllByRole("listitem")
        .filter((item: HTMLElement) => item.className.includes("task-count-chip")),
    ).toHaveLength(0)
  })

  it("チップを押すとその状態だけに絞る", () => {
    renderTaskSection(MIXED_TASKS)

    fireEvent.click(inSection().getByRole("button", { name: "未着手 1" }))

    expect(inSection().getByText("架空の未着手")).toBeDefined()
    expect(inSection().queryByText("架空の進行中")).toBeNull()
    expect(inSection().queryByText("架空の完了")).toBeNull()
  })

  it("選んでいるチップをもう一度押すと全件に戻る", () => {
    renderTaskSection(MIXED_TASKS)

    const chip = inSection().getByRole("button", { name: "未着手 1" })
    fireEvent.click(chip)
    fireEvent.click(chip)

    expect(inSection().getByText("架空の未着手")).toBeDefined()
    expect(inSection().getByText("架空の進行中")).toBeDefined()
    expect(inSection().getByText("架空の完了")).toBeDefined()
  })

  it("別のチップを押すと絞り込みが切り替わる", () => {
    renderTaskSection(MIXED_TASKS)

    fireEvent.click(inSection().getByRole("button", { name: "未着手 1" }))
    fireEvent.click(inSection().getByRole("button", { name: "完了 1" }))

    expect(inSection().queryByText("架空の未着手")).toBeNull()
    expect(inSection().getByText("架空の完了")).toBeDefined()
  })

  it("aria-pressed が選んでいるチップにだけ付く", () => {
    renderTaskSection(MIXED_TASKS)

    const todoChip = inSection().getByRole("button", { name: "未着手 1" })
    const doingChip = inSection().getByRole("button", { name: "進行中 1" })
    expect(todoChip.getAttribute("aria-pressed")).toBe("false")
    expect(doingChip.getAttribute("aria-pressed")).toBe("false")

    fireEvent.click(todoChip)

    expect(todoChip.getAttribute("aria-pressed")).toBe("true")
    expect(doingChip.getAttribute("aria-pressed")).toBe("false")
  })
})
