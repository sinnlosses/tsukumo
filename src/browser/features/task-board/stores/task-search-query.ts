// サイドバーの探す欄の語。保存しない。一覧モードで変えた語はここへ戻さない。

import { create } from "zustand"

type TaskSearchQueryState = {
  readonly query: string
  readonly setQuery: (query: string) => void
}

export const useTaskSearchQuery = create<TaskSearchQueryState>()((set) => ({
  query: "",
  setQuery: (query) => {
    set({ query })
  },
}))
