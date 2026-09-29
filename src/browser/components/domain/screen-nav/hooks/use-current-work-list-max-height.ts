// メインビューの下に浮かぶ札（`data-variant="capsule"`）の一覧の高さの上限を実測で決める。
// 上限は、一覧の下端から、一覧の入る領域（`[data-region="main"]`）の中の `<header>` の下端
// （無ければ領域の上端）まで。窓・領域・頭の大きさが変わるたびに測り直す。

import { useLayoutEffect, type RefObject } from "react"

const MAX_HEIGHT_PROPERTY = "--current-work-list-max-height"
const REGION_SELECTOR = '[data-region="main"]'
/** 一覧の上端と頭の下端の間に残す隙間（一覧が札の上へ開く隙間 0.4rem と揃える）。 */
const TOP_GAP_PX = 6

export function useCurrentWorkListMaxHeight(
  listRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useLayoutEffect(() => {
    const list = listRef.current
    if (!enabled || list === null) {
      return undefined
    }
    const region = list.closest(REGION_SELECTOR)
    if (region === null) {
      return undefined
    }

    const measure = (): void => {
      const header = region.querySelector("header")
      const upperBound =
        header !== null ? header.getBoundingClientRect().bottom : region.getBoundingClientRect().top
      const available = list.getBoundingClientRect().bottom - upperBound - TOP_GAP_PX
      list.style.setProperty(MAX_HEIGHT_PROPERTY, `${String(Math.max(available, 0))}px`)
    }

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(region)
    const header = region.querySelector("header")
    if (header !== null) {
      resizeObserver.observe(header)
    }
    region.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", measure)
    measure()

    return () => {
      resizeObserver.disconnect()
      region.removeEventListener("scroll", measure)
      window.removeEventListener("resize", measure)
      list.style.removeProperty(MAX_HEIGHT_PROPERTY)
    }
  }, [listRef, enabled])
}
