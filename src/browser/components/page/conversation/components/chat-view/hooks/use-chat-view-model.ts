// 雑談の画面の状態（`useChatView` の戻り値）を、メインビューの立ち絵とログへ配る束。
// state は器の外側（`ChatViewProvider`）が持ち、仕事と雑談を切り替えても器を作り直さない。

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
