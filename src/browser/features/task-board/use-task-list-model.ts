// サイドバーのタスク一覧の状態。探す語・↑↓ で選んでいる位置・済みの段の開閉を持ち、行とサイドシートをつなぐ。
// 探す欄（見出しの帯）と一覧（区画の中身）は別の場所に描かれるので、両方が読む状態をここに集める。
// 語と位置は保存しない。
//
// サイドシートを開いてもフォーカスは押した行に残り、↑↓・Esc・Alt+← は一覧の器（`rootRef`）が受ける。
// 外側を押しても閉じない（サイドシートは非モーダルで、開いたまま入力欄に書ける）。
// 狭い画面（760px 以下）にはサイドシートの置き場が無いので、行を開くとタスクのモーダルをそのタスクを選んで開く。

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import { useExternalSync } from "../../hooks/use-external-sync.ts"
import { usePhoneWidth } from "../../hooks/use-phone-width.ts"
import { useComposerFocus } from "../../stores/composer-focus.ts"
import { useTaskBoardRequest } from "../../stores/task-board-request.ts"
import { useTaskSheet } from "../../stores/task-sheet.ts"
import { taskRowDomId } from "./domain/task-row-dom-id.ts"
import { isSearching, moveActiveIndex, searchStages } from "./domain/task-search.ts"
import type { TaskStageGroup } from "./domain/task-stage.ts"

/** 行とサイドシートのつなぎ。`openId` はサイドシートで開いているタスク（閉じていれば無い）。 */
export type TaskListSheet = {
  readonly openId?: string
  /**
   * 行を押したとき。広い幅では、開いている行なら閉じ、ほかの行ならサイドシートをそちらへ移す。
   * 狭い幅ではタスクのモーダルを開く。
   */
  readonly onOpenRow: (id: string) => void
}

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
  readonly sheet: TaskListSheet
  /** ドラフトの段の「仕分ける」。サイドシートの置き場が無い狭い幅では `none`。 */
  readonly sort:
    | { readonly kind: "none" }
    | { readonly kind: "some"; readonly open: boolean; readonly onToggle: () => void }
  readonly onQueryChange: (query: string) => void
  readonly onToggleDone: () => void
  readonly onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  readonly onListKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/** `rootRef` は一覧の器に付ける。モデルに入れると、モデルを読むたびに ref を描画中に読むことになる。 */
export function useTaskListModel(tasks: TaskSummaryResult): {
  readonly model: TaskListModel
  readonly rootRef: RefObject<HTMLDivElement | null>
} {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)
  const [doneOpen, setDoneOpen] = useState(false)
  const requestFocus = useComposerFocus((state) => state.requestFocus)
  const sheetState = useTaskSheet((state) => state.sheet)
  const openSheet = useTaskSheet((state) => state.open)
  const toggleSheet = useTaskSheet((state) => state.toggle)
  const toggleSort = useTaskSheet((state) => state.toggleSort)
  const stepSheet = useTaskSheet((state) => state.step)
  const backSheet = useTaskSheet((state) => state.back)
  const closeSheet = useTaskSheet((state) => state.close)
  const setOrder = useTaskSheet((state) => state.setOrder)
  const openTask = useTaskBoardRequest((request) => request.openTask)
  const phone = usePhoneWidth()

  const searching = isSearching(query)
  const groups = tasks.kind === "known" ? searchStages(tasks.items, query) : []
  const shownIds = groups.flatMap((group) =>
    group.stage === "done" && !searching && !doneOpen ? [] : group.tasks.map((task) => task.id),
  )
  const activeId = shownIds[activeIndex]
  const openId = sheetState.kind === "open" ? sheetState.id : undefined

  // 並びの配列は描画のたびに作り直るので、字に畳んで変わったときだけ書く。
  const orderKey = shownIds.join("\n")
  useExternalSync(() => {
    setOrder(orderKey === "" ? [] : orderKey.split("\n"))
  }, [orderKey, setOrder])

  const focusRow = (taskId: string): void => {
    rootRef.current?.ownerDocument.getElementById(taskRowDomId(taskId))?.focus()
  }

  const onOpenRow = (id: string): void => {
    if (phone) {
      openTask(id)
    } else {
      toggleSheet(id)
    }
  }

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
      case "ArrowUp": {
        event.preventDefault()
        const nextIndex = moveActiveIndex(
          activeIndex,
          event.key === "ArrowDown" ? 1 : -1,
          shownIds.length,
        )
        setActiveIndex(nextIndex)
        const nextId = shownIds[nextIndex]
        if (openId !== undefined && nextId !== undefined) {
          openSheet(nextId)
        }
        return
      }
      case "Enter":
        if (activeId !== undefined) {
          event.preventDefault()
          onOpenRow(activeId)
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

  const onListKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (openId === undefined || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey) {
      return
    }
    if (event.altKey) {
      if (
        event.key === "ArrowLeft" &&
        sheetState.kind === "open" &&
        sheetState.previousId !== undefined
      ) {
        event.preventDefault()
        backSheet()
      }
      return
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault()
        const next = shownIds[shownIds.indexOf(openId) + (event.key === "ArrowDown" ? 1 : -1)]
        if (next !== undefined && shownIds.includes(openId)) {
          focusRow(next)
        }
        stepSheet(event.key === "ArrowDown" ? 1 : -1)
        return
      }
      case "Escape":
        event.preventDefault()
        focusRow(openId)
        closeSheet()
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
    sheet: { ...(openId === undefined ? {} : { openId }), onOpenRow },
    sort: phone
      ? { kind: "none" }
      : { kind: "some", open: sheetState.kind === "sort", onToggle: toggleSort },
    onQueryChange,
    onToggleDone: () => {
      setDoneOpen((open) => !open)
    },
    onSearchKeyDown,
    onListKeyDown,
  }
  return { model, rootRef }
}
