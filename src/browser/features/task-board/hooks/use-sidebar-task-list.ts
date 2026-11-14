// サイドバーのタスクの一覧のロジック。選んだ行を持ち、↑↓ で選び、Enter か「依頼」で確認なしに依頼を送る。
// 送る文面と頼めるかの判定は探す（⌘K）の「タスクを頼む」と同じ `taskStartRequest`。

import { useId, useState, type KeyboardEvent } from "react"

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { codeSpanParts } from "../../../domain/code-span.ts"
import { useSession, useTurnRunning } from "../../../stores/session.ts"
import { sidebarTaskGroups } from "../domain/sidebar-task-group.ts"
import type {
  SidebarTaskListView,
  SidebarTaskRequestGate,
  SidebarTaskRow,
} from "../domain/sidebar-task-list-view.ts"
import { taskStartRequest } from "../task-request.ts"

const TURN_RUNNING_REASON = "ターン中は依頼できない"

/** 選んだ行。まだ選んでいないあいだは「着手できる」の先頭が選ばれている。 */
type ChosenRow = { readonly kind: "none" } | { readonly kind: "row"; readonly id: string }

export function useSidebarTaskList(excludedIds: readonly string[]): SidebarTaskListView {
  const tasks = useSession((session) => session.state.tasks)
  const dispatch = useSession((session) => session.dispatch)
  const turnRunning = useTurnRunning()
  const [chosen, setChosen] = useState<ChosenRow>({ kind: "none" })
  const listId = useId()

  if (tasks.kind !== "known") {
    return { kind: tasks.kind }
  }

  const { ready, waiting } = sidebarTaskGroups(tasks.items, excludedIds)
  const selected = ready.find((item) => chosen.kind === "row" && item.id === chosen.id) ?? ready[0]
  const optionIdOf = (id: string): string => `${listId}-${id}`
  const rowOf = (item: TaskSummaryItem): SidebarTaskRow => ({
    id: item.id,
    optionId: optionIdOf(item.id),
    summary: codeSpanParts(item.summary),
    difficulty: item.difficulty,
    loopable: item.loopable,
    selected: item.id === selected?.id,
    waitingFor: item.waitingFor,
  })
  const gate: SidebarTaskRequestGate = turnRunning
    ? { kind: "closed", reason: TURN_RUNNING_REASON }
    : { kind: "open" }

  const request = (id: string): void => {
    const item = ready.find((each) => each.id === id)
    if (item === undefined || turnRunning) {
      return
    }
    const start = taskStartRequest(item)
    if (start.kind === "requestable") {
      void dispatch.session.prompt({ text: start.prompt, images: [] })
    }
  }

  const move = (step: number): void => {
    const index = ready.findIndex((item) => item.id === selected?.id)
    const next = ready[Math.min(Math.max(index + step, 0), ready.length - 1)]
    if (next !== undefined) {
      setChosen({ kind: "row", id: next.id })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target instanceof HTMLButtonElement) {
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      move(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Enter" && selected !== undefined) {
      event.preventDefault()
      request(selected.id)
    }
  }

  return {
    kind: "list",
    listId,
    activeOptionId: selected === undefined ? undefined : optionIdOf(selected.id),
    ready: ready.map(rowOf),
    waiting: waiting.map(rowOf),
    gate,
    onSelect: (id) => {
      setChosen({ kind: "row", id })
    },
    onRequest: request,
    onKeyDown,
  }
}
