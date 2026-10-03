// お伺いの札まで連れてきてほしいという一回限りの合図。
// 持つのは呼ばれた回数と、そのときにフォーカスも移すかだけで、回数が増えるたびにお伺いの札が転がし直す。

import { create } from "zustand"

/** `focus` が true なら、転がしたあと最初の選択肢へフォーカスを移す。 */
export type InquiryJump = { readonly signal: number; readonly focus: boolean }

export type InquiryJumpState = {
  readonly jump: InquiryJump
  readonly requestJump: (request: { readonly focus: boolean }) => void
}

export const useInquiryJump = create<InquiryJumpState>()((set) => ({
  jump: { signal: 0, focus: false },
  requestJump: ({ focus }) => {
    set((state) => ({ jump: { signal: state.jump.signal + 1, focus } }))
  },
}))
