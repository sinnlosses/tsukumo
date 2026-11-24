// `<TaskSheet>`（サイドシート）のロジック。
// 開いているタスクは `useTaskSheet` が持ち、ここはそのタスクの詳細と操作の口を一覧モードと同じ形（`selectionOf`）に畳み、
// 頼む口の確認の開閉を持つ。
// 開いているタスクがタスクの一覧から消えたら閉じる。探す語や済みの段の畳みで行が隠れただけでは閉じない。
// 外側（`KEEPS_SHEET_OPEN` の外）を押しても閉じる。

import { useState, type KeyboardEvent } from "react"

import type { TaskSummaryResult } from "../../../../shared/repository/task-summary.ts"
import { useEventListener } from "../../../hooks/use-event-listener.ts"
import { useExternalSync } from "../../../hooks/use-external-sync.ts"
import { useTurnRunning } from "../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../stores/task-board-request.ts"
import { useTaskSheet, type TaskSheetSubject } from "../../../stores/task-sheet.ts"
import { boardEntries, selectionOf } from "../domain/task-board-content.ts"
import type { TaskBoardSelection } from "../domain/task-board-view.ts"
import { TASK_SHEET_DOM_ID, taskRowDomId } from "../domain/task-row-dom-id.ts"
import type { TaskRunConfirmOutcome } from "../domain/task-run-confirm-outcome.ts"
import type { TaskRunTarget } from "../domain/task-run-prompt.ts"
import { useTaskSearchQuery } from "../stores/task-search-query.ts"

/**
 * 押してもサイドシートを閉じない場所。サイドシートそのもの、行を押して切り替えるサイドバー、開いたまま書いて送る入力欄。
 * 頼む口の確認（`<dialog>`）はサイドシートの中に置かれるので、サイドシートに含まれる。
 */
const KEEPS_SHEET_OPEN = `#${TASK_SHEET_DOM_ID}, [data-region="sidebar"], [data-region="dispatch"]`

/** 頼む口の確認。開いているあいだはサイドシートの Esc を受けない（Esc は上の確認だけを閉じる）。 */
type TaskSheetConfirm =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly target: TaskRunTarget }

export type TaskSheetView =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly selection: Extract<TaskBoardSelection, { readonly kind: "some" }>
      /** 本文中の ID の自動リンクが照らす、いまの一覧に載っている ID。 */
      readonly knownIds: ReadonlySet<string>
      readonly confirm: TaskSheetConfirm
      /** 「一覧モードで開く」。タスクのモーダルが置かれている画面（仕事）だけ `some`。 */
      readonly listMode:
        | { readonly kind: "none" }
        | { readonly kind: "some"; readonly onOpen: () => void }
      /** つながり・パンくずで詳細を切り替えるたびに増える。器へフォーカスを戻す合図。 */
      readonly focusSignal: number
      readonly onStep: (delta: 1 | -1) => void
      /** 「×」と Esc。開いていた行へフォーカスを戻す。 */
      readonly onClose: () => void
      readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
      readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
    }

/** `listModeAvailable` は、タスクのモーダルが置かれている画面か（雑談の画面には置かれず、開く口を出さない）。 */
export function useTaskSheetView(
  tasks: TaskSummaryResult,
  sheet: Exclude<TaskSheetSubject, { readonly kind: "sort" }>,
  listModeAvailable: boolean,
): TaskSheetView {
  const focusSignal = useTaskSheet((state) => state.focusSignal)
  const openTask = useTaskBoardRequest((request) => request.openTask)
  const searchQuery = useTaskSearchQuery((state) => state.query)
  const step = useTaskSheet((state) => state.step)
  const jump = useTaskSheet((state) => state.jump)
  const back = useTaskSheet((state) => state.back)
  const close = useTaskSheet((state) => state.close)
  const [confirm, setConfirm] = useState<TaskSheetConfirm>({ kind: "closed" })
  const turnRunning = useTurnRunning()

  const items = tasks.kind === "known" ? tasks.items : []
  const entries = boardEntries(items)
  const byId = new Map(entries.map((entry) => [entry.task.id, entry]))
  const entry = sheet.kind === "open" ? byId.get(sheet.id) : undefined
  const vanished = sheet.kind === "open" && tasks.kind === "known" && entry === undefined

  useExternalSync(() => {
    if (vanished) {
      close()
    }
  }, [vanished, close])

  useEventListener(
    document,
    "pointerdown",
    (event) => {
      // フォーカスは押した先へ移るのに任せ、行へは戻さない。
      if (event.target instanceof Element && !event.target.closest(KEEPS_SHEET_OPEN)) {
        close()
      }
    },
    { enabled: sheet.kind === "open" && entry !== undefined && confirm.kind === "closed" },
  )

  if (sheet.kind !== "open" || entry === undefined) {
    return { kind: "closed" }
  }

  const knownIds = new Set(items.map((item) => item.id))
  const closeToRow = (): void => {
    globalThis.document.getElementById(taskRowDomId(sheet.id))?.focus()
    setConfirm({ kind: "closed" })
    close()
  }

  return {
    kind: "open",
    selection: selectionOf(entry, entries, byId, {
      turnRunning,
      run: (taskId, request) => {
        setConfirm({ kind: "open", target: { kind: "task", taskId, request } })
      },
      onJump: (id) => {
        if (knownIds.has(id)) {
          jump(id)
        }
      },
      onCopy: (id) => {
        // 書けなかったとき（ウィンドウにフォーカスが無いなど）は何もしない。押し直せば済む。
        void navigator.clipboard.writeText(id).catch(() => {})
      },
      breadcrumb:
        sheet.previousId === undefined
          ? { kind: "none" }
          : { kind: "some", previousId: sheet.previousId, onBack: back },
    }),
    knownIds,
    confirm,
    listMode: listModeAvailable
      ? {
          kind: "some",
          onOpen: () => {
            closeToRow()
            openTask(sheet.id, searchQuery)
          },
        }
      : { kind: "none" },
    focusSignal,
    onStep: step,
    onClose: closeToRow,
    onKeyDown: (event) => {
      if (
        confirm.kind === "open" ||
        event.nativeEvent.isComposing ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return
      }
      if (event.altKey) {
        if (event.key === "ArrowLeft" && sheet.previousId !== undefined) {
          event.preventDefault()
          back()
        }
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        closeToRow()
      }
    },
    onConfirmClose: (outcome) => {
      setConfirm({ kind: "closed" })
      if (outcome === "sent") {
        closeToRow()
      }
    },
  }
}
