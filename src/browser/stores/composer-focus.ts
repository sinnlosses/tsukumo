// 入力欄へフォーカスしてほしいという一回限りの合図（スキップリンクが押す）。
// 持つのは押された回数だけで、回数が増えるたびに入力欄がフォーカスし直す。

import { create } from "zustand"

import { isOverlayOpen } from "../hooks/open-overlay.ts"

type ComposerFocusState = {
  readonly signal: number
  readonly requestFocus: () => void
}

/**
 * 用件（お伺い・お願い）の中で押された修飾キーなしの Esc を受けて、入力欄へフォーカスを戻す。戻したら true。
 * 重なる面（広げた板を含む）が開いているあいだは、その面を閉じる Esc に譲る。
 */
export function returnFocusToComposerOnEscape(event: KeyboardEvent): boolean {
  if (
    event.key !== "Escape" ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    isOverlayOpen()
  ) {
    return false
  }
  useComposerFocus.getState().requestFocus()
  return true
}

export const useComposerFocus = create<ComposerFocusState>()((set) => ({
  signal: 0,
  requestFocus: () => {
    set((state) => ({ signal: state.signal + 1 }))
  },
}))
