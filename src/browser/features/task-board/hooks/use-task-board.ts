// `<TaskBoard>`（タスクのモーダル）のロジック。
// 開いているか（と、開いたときに選ぶ行）は呼び出し側の `TaskBoardRequest` で、ここはそれを `<Dialog open={...}>` へ渡す形にするのと、次の2つを持つ。
// - 表示上の状態（検索の文字・絞り込みの札・選んでいる ID・パンくず・開いている確認）。閉じると初めに戻す
// - 一覧を、行・絞り込みの札・選んだタスクの詳細・操作の帯へ畳む
// CSS の class 名はここでは決めない。

import { useReducer, useState } from "react"

import { DEFAULT_RUN_PROMPT } from "../../../../shared/repository/project-settings.ts"
import type { TaskSummaryResult } from "../../../../shared/repository/task-summary.ts"
import type { TaskBoardRequest } from "../../../stores/task-board-request.ts"
import { boardContent, boardEntries, type BoardEntry } from "../domain/task-board-content.ts"
import { countsTextOf, matchesFilter, matchesQuery } from "../domain/task-board-filter.ts"
import type { TaskBoardView } from "../domain/task-board-view.ts"
import { taskListCounts } from "../domain/task-list-count.ts"
import {
  boardReducer,
  initialBoardState,
  isChosen,
  isPinned,
  type ShownRow,
} from "./task-board-state.ts"
import { useRunDestination } from "./use-run-destination.ts"

export function useTaskBoard(
  tasks: TaskSummaryResult,
  request: TaskBoardRequest,
  onClose: () => void,
): TaskBoardView {
  const open = request.kind === "open"
  const [state, send] = useReducer(boardReducer, request, initialBoardState)
  const [requestShown, setRequestShown] = useState(request)
  if (request !== requestShown) {
    setRequestShown(request)
    send({ kind: "open", request })
  }
  const [confirmingId, setConfirmingId] = useState<string | undefined>(undefined)
  const runPrompt = tasks.kind === "known" ? tasks.runPrompt : DEFAULT_RUN_PROMPT
  const destination = useRunDestination(runPrompt)

  const { query, filter, chosen } = state
  const items = tasks.kind === "known" ? tasks.items : []
  const entries = boardEntries(items)
  const byId = new Map(entries.map((entry) => [entry.task.id, entry]))
  const isVisible = (entry: BoardEntry): boolean =>
    matchesFilter(entry.state, filter) && matchesQuery(entry.task, query)
  const rows = entries.filter((entry) => isVisible(entry) || isPinned(chosen, entry.task.id))
  // 選んでいた行が絞り込み・検索で消えたときも、一覧の先頭へ落ちる。
  const selected = rows.find((entry) => isChosen(chosen, entry.task.id)) ?? rows[0]
  const shown: ShownRow =
    selected === undefined ? { kind: "none" } : { kind: "row", id: selected.task.id }

  const knownIds = new Set(items.map((item) => item.id))
  const jumpTo = (id: string): void => {
    if (selected === undefined || !knownIds.has(id)) {
      return
    }
    send({ kind: "jump", id, shownId: selected.task.id })
  }

  const close = (): void => {
    send({ kind: "close" })
    setConfirmingId(undefined)
    onClose()
  }

  /** 一覧で行を直に選ぶ（クリック・↑↓）。パンくずと一時的な行は引っ込む。 */
  const select = (id: string): void => {
    send({ kind: "select", id })
  }

  /** パンくずの「戻る」・Alt+←。戻る先が無ければ何もしない。 */
  const goBack = (): void => {
    send({ kind: "back" })
  }

  const move = (step: number): void => {
    const index = rows.findIndex((entry) => entry === selected)
    const next = rows[Math.min(Math.max(index + step, 0), rows.length - 1)]
    if (next !== undefined) {
      select(next.task.id)
    }
  }

  const content = boardContent(tasks, entries, byId, rows, selected, isVisible, knownIds, {
    query,
    filter,
    destination,
    run: setConfirmingId,
    onJump: jumpTo,
    breadcrumb:
      chosen.kind === "jumped"
        ? { kind: "some", previousId: chosen.previousId, onBack: goBack }
        : { kind: "none" },
  })

  return {
    open,
    countsText: tasks.kind === "known" ? countsTextOf(taskListCounts(tasks.items)) : "",
    content,
    confirm:
      confirmingId === undefined
        ? { kind: "closed" }
        : {
            kind: "open",
            taskId: confirmingId,
            held: byId.get(confirmingId)?.state.kind === "hold",
            runPrompt,
          },
    onClose: close,
    onQueryChange: (nextQuery) => {
      send({ kind: "query", query: nextQuery, shown })
    },
    onFilter: (nextFilter) => {
      send({ kind: "filter", filter: nextFilter, shown })
    },
    onSelect: select,
    onKeyDown: (event) => {
      if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey) {
        return
      }
      if (event.altKey) {
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          goBack()
        }
        return
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        move(event.key === "ArrowDown" ? 1 : -1)
      }
    },
    onConfirmClose: (outcome) => {
      setConfirmingId(undefined)
      if (outcome === "sent") {
        close()
      }
    },
    focusSignal: state.focusSignal,
  }
}
