// サイドバーのタスク一覧の状態。探す語・↑↓ で選んでいる位置・済みの段の開閉・行のプレビューを持つ。
// 探す欄（見出しの帯）と一覧（区画の中身）は別の場所に描かれるので、両方が読む状態をここに集める。
// 語と位置は保存しない。

import { useId, useState, type KeyboardEvent, type RefObject } from "react"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import { useComposerFocus } from "../../stores/composer-focus.ts"
import { isSearching, moveActiveIndex, searchStages } from "./domain/task-search.ts"
import type { TaskStageGroup } from "./domain/task-stage.ts"
import { taskRowDomId, useTaskPeek, type TaskPeekControl } from "./hooks/use-task-peek.ts"

export type TaskListModel = {
  readonly query: string
  readonly searching: boolean
  readonly groups: readonly TaskStageGroup[]
  readonly doneOpen: boolean
  /** 選んでいる行の ID。選びが無ければ無い。 */
  readonly activeId?: string
  /** 探す欄の `aria-activedescendant`。 */
  readonly activeRowDomId?: string
  readonly matchCount: number
  readonly listId: string
  readonly peek: TaskPeekControl
  readonly onQueryChange: (query: string) => void
  readonly onToggleDone: () => void
  readonly onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

/** `rootRef` は一覧の器に付ける。モデルに入れると、モデルを読むたびに ref を描画中に読むことになる。 */
export function useTaskListModel(tasks: TaskSummaryResult): {
  readonly model: TaskListModel
  readonly rootRef: RefObject<HTMLDivElement | null>
} {
  const listId = useId()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)
  const [doneOpen, setDoneOpen] = useState(false)
  const requestFocus = useComposerFocus((state) => state.requestFocus)

  const searching = isSearching(query)
  const groups = tasks.kind === "known" ? searchStages(tasks.items, query) : []
  const shownIds = groups.flatMap((group) =>
    group.stage === "done" && !searching && !doneOpen ? [] : group.tasks.map((task) => task.id),
  )
  const { rootRef, control: peek } = useTaskPeek(shownIds)
  const activeId = shownIds[activeIndex]

  const onQueryChange = (next: string): void => {
    setQuery(next)
    setActiveIndex(isSearching(next) ? 0 : -1)
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault()
        setActiveIndex(
          moveActiveIndex(activeIndex, event.key === "ArrowDown" ? 1 : -1, shownIds.length),
        )
        return
      case "Enter":
        if (activeId !== undefined) {
          event.preventDefault()
          peek.onToggle(activeId)
        }
        return
      case "Escape":
        event.preventDefault()
        if (searching) {
          onQueryChange("")
        } else {
          requestFocus()
        }
        return
      default:
        return
    }
  }

  const model: TaskListModel = {
    query,
    searching,
    groups,
    doneOpen,
    ...(activeId === undefined ? {} : { activeId, activeRowDomId: taskRowDomId(activeId) }),
    matchCount: shownIds.length,
    listId,
    peek,
    onQueryChange,
    onToggleDone: () => {
      setDoneOpen((open) => !open)
    },
    onSearchKeyDown,
  }
  return { model, rootRef }
}
