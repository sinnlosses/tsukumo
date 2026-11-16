import { render, screen } from "@testing-library/react"
import type { ReactElement } from "react"

import { TaskBoard } from "../../../../src/browser/features/task-board/task-board.tsx"
import type { TaskBoardRequest } from "../../../../src/browser/stores/task-board-request.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { knownTaskSummary, taskStatusOfWord } from "../../../fixture/session-state.ts"
import { queryClientWrapper } from "../../query-client.tsx"
import { putSession } from "../../session-store.ts"

// タスクのモーダルを開いた形で描き、選んでいる行を読む道具。
// フィクスチャはすべて手で書いた架空の課題。

export const OPEN_FIRST: TaskBoardRequest = { kind: "open", focus: { kind: "first" }, query: "" }

export function selectionTask(id: string, status: string, body: string): TaskSummaryItem {
  return {
    id,
    summary: `架空の課題（${id}）`,
    status: taskStatusOfWord(status),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body,
    location: { kind: "none" },
  }
}

export const SELECTION_TASKS: readonly TaskSummaryItem[] = [
  selectionTask("X-001", "todo", "X-002 の保留が解けたら進める。\n"),
  selectionTask("X-002", "hold", "架空の保留。\n"),
  selectionTask("X-003", "todo", "架空の本文。\n"),
]

export function renderSelectionBoard(
  items: readonly TaskSummaryItem[],
  request: TaskBoardRequest,
): {
  readonly rerenderWith: (items: readonly TaskSummaryItem[], request: TaskBoardRequest) => void
} {
  putSession(INITIAL_SESSION_STATE)
  const boardOf = (
    nextItems: readonly TaskSummaryItem[],
    nextRequest: TaskBoardRequest,
  ): ReactElement => (
    <TaskBoard tasks={knownTaskSummary(nextItems)} request={nextRequest} onClose={() => {}} />
  )
  const { rerender } = render(boardOf(items, request), { wrapper: queryClientWrapper() })
  return {
    rerenderWith: (nextItems, nextRequest) => {
      rerender(boardOf(nextItems, nextRequest))
    },
  }
}

export function searchBox(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("combobox", { name: "タスクを探す" })
}

/** 一覧で選んでいる行と、右に出している詳細が、どちらも `id` のタスクか。 */
export function isShown(id: string): boolean {
  return (
    screen.getByRole("option", { selected: true }).id === `task-board-option-${id}` &&
    screen.queryByRole("region", { name: `${id} の詳細` }) !== null
  )
}
