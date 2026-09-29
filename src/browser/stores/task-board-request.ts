// タスクのモーダルを開いているか、開くならどのタスクを選んで開くか。
// モーダルは会話の画面に1つだけ置き、開く口はどれもここを通す。

import { create } from "zustand"

/** 開いたときに選ぶ行。`first` は一覧の先頭。 */
export type TaskBoardFocus =
  | { readonly kind: "first" }
  | { readonly kind: "task"; readonly id: string }

export type TaskBoardRequest =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly focus: TaskBoardFocus }

export type TaskBoardRequestState = {
  readonly request: TaskBoardRequest
  readonly openList: () => void
  readonly openTask: (id: string) => void
  readonly close: () => void
}

export const useTaskBoardRequest = create<TaskBoardRequestState>()((set) => ({
  request: { kind: "closed" },
  openList: () => {
    set({ request: { kind: "open", focus: { kind: "first" } } })
  },
  openTask: (id) => {
    set({ request: { kind: "open", focus: { kind: "task", id } } })
  },
  close: () => {
    set({ request: { kind: "closed" } })
  },
}))
