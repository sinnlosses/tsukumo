// つまみを下へ払う動き。つまみの上で押した点から一定の距離だけ下へ動いたら閉じる。

import { useRef, type PointerEvent } from "react"

/** これだけ下へ動いたら閉じる（px）。 */
const CLOSE_DISTANCE = 48

export type SheetSwipe = {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void
  readonly onPointerEnd: (event: PointerEvent<HTMLElement>) => void
}

export function useSheetSwipe(onClose: () => void): SheetSwipe {
  const startY = useRef<number | undefined>(undefined)

  return {
    onPointerDown: (event) => {
      startY.current = event.clientY
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event) => {
      const start = startY.current
      if (start !== undefined && event.clientY - start >= CLOSE_DISTANCE) {
        startY.current = undefined
        onClose()
      }
    },
    onPointerEnd: () => {
      startY.current = undefined
    },
  }
}
