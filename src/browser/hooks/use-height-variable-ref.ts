// 付いた要素の外寸の高さを測り、書き先の要素の CSS 変数に書く ref コールバックを返すフック。
// 外れるときは変数を消す。書き先が無い（`undefined`）ときは何も書かない。

import type { RefCallback } from "react"

import { useResizeObservedRef } from "./use-observed-ref.ts"

export function useHeightVariableRef<Element extends HTMLElement>(
  property: string,
  targetOf: (element: Element) => HTMLElement | undefined,
): RefCallback<Element> {
  return useResizeObservedRef<Element>(
    (element) => {
      targetOf(element)?.style.setProperty(property, `${String(element.offsetHeight)}px`)
    },
    (element) => {
      targetOf(element)?.style.removeProperty(property)
    },
  )
}
