// サイドバーのタスクの行から開くのぞき窓の開閉と、開いている間のキー。
//
// 窓を開いてもフォーカスは押した行に残り、↑↓ は一覧の器（`rootRef`）が受けて隣の行へ移す。
// 窓は開いている行の `<li>` の中に置くので、窓の中の口で打った ↑↓ も器へ届く。
// 確認（モーダルの `<dialog>`）も窓の中に組み立てられるので、確認を開いている間は ↑↓ を受けず、
// Esc と外側の `pointerdown` の購読も止める（Esc は上の確認だけを閉じる）。
//
// 開いている行が絞り込み後の行から消えたら閉じる。

import { useRef, useState, type KeyboardEvent, type RefObject } from "react"

import { useDismissSignal, type DismissCause } from "../../../hooks/use-dismiss-signal.ts"
import { useTaskBoardRequest } from "../../../stores/task-board-request.ts"
import type { TaskRunConfirmOutcome } from "../domain/task-run-confirm-outcome.ts"

export type TaskPeekState =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly id: string; readonly confirming: boolean }

export type TaskPeek = {
  /** 行と窓をまとめる器。この中の `pointerdown` では閉じない。 */
  readonly rootRef: RefObject<HTMLDivElement | null>
  readonly control: TaskPeekControl
}

export type TaskPeekControl = {
  readonly state: TaskPeekState
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  /** 行を押したとき。開いている行なら閉じ、別の行なら窓をそちらへ移す。 */
  readonly onToggle: (id: string) => void
  /** 「×」。押した行へフォーカスを戻す。 */
  readonly onClose: () => void
  /** 「全文を開く」と本文中の ID。タスクのモーダルをそのタスクを選んで開き、窓は閉じる。 */
  readonly onOpenFull: (id: string) => void
  /** 「これを始める」。 */
  readonly onStart: () => void
  readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
}

/** 行のボタンの DOM の id。窓の位置の基準と、閉じたときにフォーカスを戻す先。 */
export function taskRowDomId(taskId: string): string {
  return `task-row-${taskId}`
}

/** 窓の DOM の id（行の `aria-controls` が指す）。 */
export function taskPeekDomId(taskId: string): string {
  return `task-peek-${taskId}`
}

/** `shownIds` は絞り込み後に出ている行の ID を、画面の上からの順で。 */
export function useTaskPeek(shownIds: readonly string[]): TaskPeek {
  const rootRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<TaskPeekState>({ kind: "closed" })
  const openTask = useTaskBoardRequest((request) => request.openTask)

  if (state.kind === "open" && !shownIds.includes(state.id)) {
    setState({ kind: "closed" })
  }

  const focusRow = (taskId: string): void => {
    rootRef.current?.ownerDocument.getElementById(taskRowDomId(taskId))?.focus()
  }

  const closeToRow = (): void => {
    if (state.kind === "open") {
      focusRow(state.id)
    }
    setState({ kind: "closed" })
  }

  const onDismiss = (cause: DismissCause): void => {
    if (cause === "escape") {
      closeToRow()
      return
    }
    setState({ kind: "closed" })
  }

  useDismissSignal({
    open: state.kind === "open" && !state.confirming,
    rootRef,
    onDismiss,
  })

  const control: TaskPeekControl = {
    state,
    onKeyDown: (event) => {
      if (state.kind !== "open" || state.confirming) {
        return
      }
      if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return
      }
      event.preventDefault()
      const index = shownIds.indexOf(state.id)
      const next = shownIds[index + (event.key === "ArrowDown" ? 1 : -1)]
      if (next === undefined) {
        return
      }
      focusRow(next)
      setState({ kind: "open", id: next, confirming: false })
    },
    onToggle: (id) => {
      setState(
        state.kind === "open" && state.id === id
          ? { kind: "closed" }
          : { kind: "open", id, confirming: false },
      )
    },
    onClose: closeToRow,
    onOpenFull: (id) => {
      setState({ kind: "closed" })
      openTask(id)
    },
    onStart: () => {
      if (state.kind === "open") {
        setState({ ...state, confirming: true })
      }
    },
    onConfirmClose: (outcome) => {
      if (state.kind !== "open") {
        return
      }
      focusRow(state.id)
      setState(outcome === "sent" ? { kind: "closed" } : { ...state, confirming: false })
    },
  }
  return { rootRef, control }
}
