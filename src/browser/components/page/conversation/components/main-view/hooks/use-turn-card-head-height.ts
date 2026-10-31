// 札の頭（進み具合の帯）の外寸を測り、メインビューの根の `--turn-card-head-height` に書く。

import type { RefObject } from "react"

import { useBeforePaintSync } from "../../../../../../hooks/use-before-paint-sync.ts"

const HEIGHT_PROPERTY = "--turn-card-head-height"

export function useTurnCardHeadHeight(
  headRef: RefObject<HTMLElement | null>,
  rootRef: RefObject<HTMLElement | null>,
): void {
  useBeforePaintSync(() => {
    const head = headRef.current
    const root = rootRef.current
    if (head === null || root === null) {
      return undefined
    }

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
  }, [headRef, rootRef])
}
