// 頭の外寸を測り、板の高さの上限が引く `--phone-head-height` をページの根に書く。

import type { RefObject } from "react"

import { useBeforePaintSync } from "../../../../hooks/use-before-paint-sync.ts"

const HEIGHT_PROPERTY = "--phone-head-height"

export function usePhoneHeadHeight(headRef: RefObject<HTMLElement | null>): void {
  useBeforePaintSync(() => {
    const head = headRef.current
    if (head === null) {
      return undefined
    }
    const root = document.documentElement

    const measure = (): void => {
      root.style.setProperty(HEIGHT_PROPERTY, `${String(head.offsetHeight)}px`)
    }

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(head)
    measure()

    return () => {
      resizeObserver.disconnect()
      root.style.removeProperty(HEIGHT_PROPERTY)
    }
  }, [headRef])
}
