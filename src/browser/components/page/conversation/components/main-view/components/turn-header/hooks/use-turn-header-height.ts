// 札の頭の高さを測り、札（`.turn-card`）の `--turn-header-height` に書く。
// 目次の縁の貼り付く位置と見出しへ飛んだときの余白が、続きで高くなった頭の真下を指す。

import { useLayoutEffect, type RefObject } from "react"

const HEIGHT_PROPERTY = "--turn-header-height"

export function useTurnHeaderHeight(headerRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const header = headerRef.current
    const card = header?.parentElement
    if (header === null || header === undefined || card === null || card === undefined) {
      return undefined
    }

    const measure = (): void => {
      card.style.setProperty(HEIGHT_PROPERTY, `${String(header.offsetHeight)}px`)
    }

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(header)
    measure()

    return () => {
      resizeObserver.disconnect()
      card.style.removeProperty(HEIGHT_PROPERTY)
    }
  }, [headerRef])
}
