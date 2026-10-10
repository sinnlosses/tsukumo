// 入力欄へフォーカスを入れる時機。
// やり取りが閉じているときにマウントされたとき・閉じたとき（会話の画面へ戻ったときも同じ）と、スキップリンクが押されたとき。
// 狭い画面（760px 以下）は、開いただけでキーボードと吹き出しの畳みを起こさないよう、前の2つでは入れない。

import { useEffect, type RefObject } from "react"

import { isExchangeClosed } from "../../../../../../../../../shared/session/conversation-moment.ts"
import { isOverlayOpen } from "../../../../../../../../hooks/open-overlay.ts"
import { useComposerFocus } from "../../../../../../../../stores/composer-focus.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { isFocusWithinMainView } from "../../../../../domain/main-view-focus.ts"
import type { ComposerSurface } from "../../../domain/composer-surface.ts"
import { isPhoneWidth } from "./use-phone-width.ts"

export function useComposerFocusTiming(surfaceRef: RefObject<ComposerSurface | null>): void {
  const closed = useSession((session) => isExchangeClosed(session.state))
  const signal = useComposerFocus((state) => state.signal)

  useEffect(() => {
    if (closed && !isPhoneWidth() && !holdsFocusElsewhere()) {
      surfaceRef.current?.focus()
    }
  }, [closed, surfaceRef])

  useEffect(() => {
    if (signal > 0) {
      surfaceRef.current?.focus()
    }
  }, [signal, surfaceRef])
}

/** メインビューを読んでいる・重なる面が開いている・別の入力欄に打っているあいだは、フォーカスを奪わない。 */
function holdsFocusElsewhere(): boolean {
  return isFocusWithinMainView() || isOverlayOpen() || isTypingElement(document.activeElement)
}

function isTypingElement(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}
