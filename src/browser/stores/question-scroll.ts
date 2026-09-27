// 帯の「質問へ」から、メインビューの質問の札へスクロールしてほしいという一回限りの合図。
// 持つのは押された回数だけで、回数が増えるたびに質問の札がスクロールし直す。

import { create } from "zustand"

export type QuestionScrollState = {
  readonly signal: number
  readonly requestScroll: () => void
}

export const useQuestionScroll = create<QuestionScrollState>()((set) => ({
  signal: 0,
  requestScroll: () => {
    set((state) => ({ signal: state.signal + 1 }))
  },
}))
