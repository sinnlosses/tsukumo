// タスクのモーダルを開いているか、開くならどのタスクを選んで開くか。
// モーダルは会話の画面に1つだけ置き、開くボタンはどれもここを通す。

import { create } from "zustand"

/** 開いたときに選ぶ行。`first` は一覧の先頭。 */
type TaskBoardFocus = { readonly kind: "first" } | { readonly kind: "task"; readonly id: string }

/** `query` は開いたときに検索欄へ入れておく語（サイドバーの探す欄から持ち込む）。 */
export type TaskBoardRequest =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly focus: TaskBoardFocus; readonly query: string }

type TaskBoardRequestState = {
  readonly request: TaskBoardRequest
  readonly openList: (query: string) => void
  readonly openTask: (id: string, query: string) => void
  readonly close: () => void
}

export const useTaskBoardRequest = create<TaskBoardRequestState>()((set) => ({
  request: { kind: "closed" },
  openList: (query) => {
    set({ request: { kind: "open", focus: { kind: "first" }, query } })
  },
  openTask: (id, query) => {
    set({ request: { kind: "open", focus: { kind: "task", id }, query } })
  },
  close: () => {
    set({ request: { kind: "closed" } })
  },
}))
