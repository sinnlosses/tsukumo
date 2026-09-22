import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { type ReactElement } from "react"

import {
  TaskSection,
  type TaskSectionFrameProps,
} from "../../../../src/browser/features/task-board/task-section.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session-state.ts"
import { type TaskSummaryItem } from "../../../../src/shared/task-summary.ts"
import { sessionStoreWith } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

afterEach(() => {
  cleanup()
})

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空の1件目",
    status: "todo",
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
  },
]

/**
 * 区画の枠の代わり。**枠を渡すのは置き場所を持つ機能の役目**（`main.tsx` が
 * `SidebarTaskFrame` を渡す）なので、ここでは同じ形の最小の枠を渡して受け渡しだけを見る。
 */
function StubFrame(props: TaskSectionFrameProps): ReactElement {
  return (
    <section data-testid="frame">
      <h2>{props.title}</h2>
      <button type="button" onClick={props.action.onAction}>
        {props.action.label}
      </button>
      {props.children}
    </section>
  )
}

function renderTaskSection(tasks: readonly TaskSummaryItem[] | undefined): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, tasks })
  render(
    <SessionStoreContext.Provider value={store}>
      <TaskSection frame={StubFrame} />
    </SessionStoreContext.Provider>,
  )
}

/** 枠の中（区画）だけを見る。表のモーダルは閉じていても木に居るので、同じ字が2つある。 */
function inFrame(): ReturnType<typeof within> {
  return within(screen.getByTestId("frame"))
}

/** 開いているかどうかは `<dialog>` の `open` 属性で見る（`task-board.test.tsx` と同じ見方）。 */
function boardIsOpen(): boolean {
  return document.querySelector("dialog.task-board")?.hasAttribute("open") === true
}

describe("TaskSection", () => {
  it("見出しの文言と区画の中身を、渡された枠に載せる", () => {
    renderTaskSection(TASKS)

    expect(inFrame().getByRole("heading").textContent).toBe("タスク一覧 todo 1")
    expect(inFrame().getByText("架空の1件目")).toBeDefined()
  })

  it("枠の押せる口（一覧を見る）で表が開く", () => {
    renderTaskSection(TASKS)
    expect(boardIsOpen()).toBe(false)

    fireEvent.click(inFrame().getByRole("button", { name: "一覧を見る" }))

    expect(boardIsOpen()).toBe(true)
  })

  it("タスクが読めていないときも枠は出る（区画は消えない）", () => {
    renderTaskSection(undefined)

    expect(inFrame().getByRole("heading").textContent).toBe("タスク一覧")
    expect(inFrame().getByText("不明")).toBeDefined()
  })
})
