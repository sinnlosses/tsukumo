// `<TaskBoard>`（タスクのモーダル）のロジック。
// 開いているか（と、開いたときに選ぶ行）は呼び出し側の `TaskBoardRequest` で、ここはそれを `<Dialog open={...}>` へ渡す形にするのと、次の2つを持つ。
// - 表示上の状態（検索の文字・絞り込みのバッジ・選んでいる ID・パンくず・開いている確認）。閉じると初めに戻す
// - 一覧を、行・絞り込みのバッジ・選んだタスクの詳細・操作の帯へ畳む
// CSS の class 名はここでは決めない。

import { useReducer, useState } from "react"

import type { TaskSummaryResult } from "../../../../shared/repository/task-summary.ts"
import type { TaskBoardRequest } from "../../../stores/task-board-request.ts"
import {
  boardContent,
  boardEntries,
  defaultBoardRow,
  type BoardEntry,
  type BoardSelected,
  type BoardStageGroup,
} from "../domain/task-board-content.ts"
import { matchesFilter, matchesQuery } from "../domain/task-board-filter.ts"
import type { TaskBoardView } from "../domain/task-board-view.ts"
import type { TaskRunTarget } from "../domain/task-run-prompt.ts"
import { stageTasks, TASK_STAGE_LABEL } from "../domain/task-stage.ts"
import {
  boardReducer,
  initialBoardState,
  isChosen,
  isPinned,
  type ShownRow,
} from "./task-board-state.ts"

export function useTaskBoard(
  tasks: TaskSummaryResult,
  request: TaskBoardRequest,
  onClose: () => void,
): TaskBoardView {
  const open = request.kind === "open"
  const [state, send] = useReducer(boardReducer, request, initialBoardState)
  if (request !== state.request) {
    send({ kind: "open", request })
  }
  const [confirming, setConfirming] = useState<TaskRunTarget | undefined>(undefined)

  const { query, filter, chosen } = state
  const items = tasks.kind === "known" ? tasks.items : []
  const entries = boardEntries(items)
  const byId = new Map(entries.map((entry) => [entry.task.id, entry]))
  const isVisible = (entry: BoardEntry): boolean =>
    matchesFilter(entry.state, filter) && matchesQuery(entry.task, query)
  const groups = stageGroups(
    entries.filter((entry) => isVisible(entry) || isPinned(chosen, entry.task.id)),
  )
  const rows = groups.flatMap((group) => group.entries)
  // 選んでいた行が絞り込み・検索で消えたときも、名指しが無いときと同じ行へ落ちる。
  const chosenRow = rows.find((entry) => isChosen(chosen, entry.task.id))
  const selectedView: BoardSelected =
    chosenRow === undefined ? defaultBoardRow(rows) : { kind: "some", entry: chosenRow }
  const selected = selectedView.kind === "some" ? selectedView.entry : undefined
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
    setConfirming(undefined)
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

  const content = boardContent(tasks, entries, byId, groups, selectedView, isVisible, knownIds, {
    query,
    filter,
    run: (taskId, taskRequest) => {
      setConfirming({ kind: "task", taskId, request: taskRequest })
    },
    onJump: jumpTo,
    onCopy: (id) => {
      // 書けなかったとき（ウィンドウにフォーカスが無いなど）は何もしない。押し直せば済む。
      void navigator.clipboard.writeText(id).catch(() => {})
    },
    breadcrumb:
      chosen.kind === "jumped"
        ? { kind: "some", previousId: chosen.previousId, onBack: goBack }
        : { kind: "none" },
  })

  return {
    open,
    content,
    confirm: confirming === undefined ? { kind: "closed" } : { kind: "open", target: confirming },
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
    onSearchKeyDown: (event) => {
      if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      if (
        event.key === "Enter" &&
        content.kind === "known" &&
        content.selection.kind === "some" &&
        content.selection.run.kind === "available"
      ) {
        event.preventDefault()
        content.selection.run.onRun()
      }
    },
    onConfirmClose: (outcome) => {
      setConfirming(undefined)
      if (outcome === "sent") {
        close()
      }
    },
    focusSignal: state.focusSignal,
  }
}

/** ↑↓ もこの並びの順で動く。 */
function stageGroups(rows: readonly BoardEntry[]): readonly BoardStageGroup[] {
  const entryOf = new Map(rows.map((entry) => [entry.task, entry]))
  return stageTasks(rows.map((entry) => entry.task)).map((group) => ({
    stage: group.stage,
    label: TASK_STAGE_LABEL[group.stage],
    entries: group.tasks.flatMap((task) => {
      const entry = entryOf.get(task)
      return entry === undefined ? [] : [entry]
    }),
  }))
}
