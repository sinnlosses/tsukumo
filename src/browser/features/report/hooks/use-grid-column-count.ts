// 格子の幅と、余白の札の横に来た印（`data-beside-card`。`useMarginCardStack` が付け外しする）を見て、列の数を持つ。
// 最初の描画で全部が1列に積まれてから並び直すのを避けるため、描画の前に1度測る。

import { type RefObject, useState } from "react"

import { useBeforePaintSync } from "../../../hooks/use-before-paint-sync.ts"
import { gridColumnCount } from "../domain/grid-column-count.ts"

const BESIDE_CARD_ATTRIBUTE = "data-beside-card"

export function useGridColumnCount(
  gridRef: RefObject<HTMLElement | null>,
  childCount: number,
): number {
  const [columns, setColumns] = useState(1)
  useBeforePaintSync(() => {
    const grid = gridRef.current
    if (grid === null) {
      return
    }
    const measure = () => {
      setColumns(columnCountOf(grid, childCount))
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(grid)
    const beside = new MutationObserver(measure)
    beside.observe(grid, { attributeFilter: [BESIDE_CARD_ATTRIBUTE] })
    return () => {
      resize.disconnect()
      beside.disconnect()
    }
  }, [gridRef, childCount])
  return columns
}

function columnCountOf(grid: HTMLElement, childCount: number): number {
  const style = getComputedStyle(grid)
  return gridColumnCount({
    childCount,
    inlineSize:
      grid.clientWidth -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0),
    fontSize: parseFloat(style.fontSize) || 16,
    gap: parseFloat(style.columnGap) || 0,
    besideCard: grid.hasAttribute(BESIDE_CARD_ATTRIBUTE),
  })
}
