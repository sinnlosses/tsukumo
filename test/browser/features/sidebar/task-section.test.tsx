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

    expect(inSection().getByText("タスク一覧 todo 1")).toBeDefined()
    expect(inSection().getByText("架空の1件目")).toBeDefined()
  })

  it("見出しの「一覧を見る」で表が開く", () => {
    renderTaskSection(TASKS)
    expect(boardIsOpen()).toBe(false)

    fireEvent.click(inSection().getByRole("button", { name: "一覧を見る" }))

    expect(boardIsOpen()).toBe(true)
  })

  it("タスクが読めていないときも区画は消えない", () => {
    renderTaskSection({ kind: "unknown" })

    expect(inSection().getByText("タスク一覧")).toBeDefined()
    expect(inSection().getByText("不明")).toBeDefined()
  })
})
