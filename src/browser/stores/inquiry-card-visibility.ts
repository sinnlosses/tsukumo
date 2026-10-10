// お伺いの札が窓の中に見えているか。
// 札の側が書き、メインビューの下端に浮かぶ「お伺い ↓」の口が読む（置き場が離れているので store を挟む）。
// 札が無いあいだと、まだ測っていないあいだは見えているものとして扱う。

import { create } from "zustand"

export type InquiryCardVisibilityState = {
  readonly visible: boolean
  readonly setVisible: (visible: boolean) => void
}

export const useInquiryCardVisibility = create<InquiryCardVisibilityState>()((set) => ({
  visible: true,
  setVisible: (visible) => {
    set({ visible })
  },
}))
