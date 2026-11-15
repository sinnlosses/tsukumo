// 雑談の画面の状態（`useChatView` の戻り値）を、左の列の立ち絵と中央の列のログへ配る束。
// 立ち絵の表情・つつく・押して留めた行は1つの state が持つので、置き場所の違う2つの部品が同じ束を読む。

import { createContext, use } from "react"

import type { ChatViewModel } from "./use-chat-view.ts"

/** 束が渡されていない描画は `none`。 */
export type ChatViewSlot = { readonly kind: "none" } | ({ readonly kind: "ready" } & ChatViewModel)

export const ChatViewContext = createContext<ChatViewSlot>({ kind: "none" })

export function useChatViewModel(): ChatViewModel {
  const slot = use(ChatViewContext)
  if (slot.kind === "none") {
    throw new Error("雑談の部品は <ChatViewProvider> の中に置く")
  }
  return slot
}
