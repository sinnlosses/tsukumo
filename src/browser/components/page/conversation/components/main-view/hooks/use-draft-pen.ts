// 書いている途中のレポートで、ミニ立ち絵の立つ場所（次の欄）を筆先として配る。
// 次の欄は草稿の器の末尾の罫線の欄（`DRAFT_SLOT_ATTRIBUTE` の印）。届くたびと器の大きさが変わるたびに測り直す。
// 待つのをやめたら（確定版が出て器が外れた）、その場に残して `resting` にする（立ち絵は本文の右下の隅へ降りる）。

import type { RefObject } from "react"

import {
  BRUSH_ORIGIN_ATTRIBUTE,
  publishBrushTip,
  restBrushTip,
} from "../../../../../../domain/reveal/brush-tip.ts"
import { useBeforePaintSync } from "../../../../../../hooks/use-before-paint-sync.ts"

/** 草稿の器の末尾に置く、次の部品を待つ欄の印。 */
export const DRAFT_SLOT_ATTRIBUTE = "data-report-draft-slot"

/** `pen` が `on` のあいだ、`ref` の器の次の欄を配る。`arrivedCount` はそれまでに届いた部品の数。 */
export function useDraftPen(
  ref: RefObject<HTMLElement | null>,
  pen: { readonly kind: "off" } | { readonly kind: "on"; readonly turnId: number },
  arrivedCount: number,
): void {
  const turnId = pen.kind === "on" ? pen.turnId : undefined
  useBeforePaintSync(() => {
    const root = ref.current
    if (turnId === undefined || root === null) {
      return undefined
    }
    const place = (): void => {
      const slot = root.querySelector(`[${DRAFT_SLOT_ATTRIBUTE}]`)
      const origin = root.closest(`[${BRUSH_ORIGIN_ATTRIBUTE}]`)
      if (slot === null || origin === null) {
        return
      }
      const box = slot.getBoundingClientRect()
      const base = origin.getBoundingClientRect()
      publishBrushTip({
        phase: "drafting",
        turnId,
        arrivedCount,
        x: box.right - base.left,
        top: box.top - base.top,
        bottom: box.bottom - base.top,
      })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(root)
    return () => {
      observer.disconnect()
    }
  }, [ref, turnId, arrivedCount])

  // 降ろすのは待つのをやめたときの1回だけ（届くたびの測り直しでは降ろさない）。
  useBeforePaintSync(() => {
    if (turnId === undefined) {
      return undefined
    }
    return () => {
      restBrushTip()
    }
  }, [turnId])
}
