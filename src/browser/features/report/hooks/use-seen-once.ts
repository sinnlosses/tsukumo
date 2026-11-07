// 要素が、転がる箱のビューポート（の少し手前）に一度でも見えたかを返すフック。一度 true になったら戻さない。
// 畳んだ中・display: none の中は交差しないので、見えるまで false のまま。観測する要素へ `ref` を付ける。

import { useState, type RefCallback } from "react"

import { useIntersectionObservedRef } from "../../../hooks/use-observed-ref.ts"

const SEEN_MARGIN = "200px"

export function useSeenOnce<Element extends HTMLElement>(): {
  readonly ref: RefCallback<Element>
  readonly seen: boolean
} {
  const [seen, setSeen] = useState(false)
  const ref = useIntersectionObservedRef<Element>({
    enabled: !seen,
    onIntersect: (entries, stop) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true)
        stop()
      }
    },
    init: (element) => ({ root: scrollBoxOf(element), rootMargin: SEEN_MARGIN }),
    onDetach: () => {},
  })
  return { ref, seen }
}

/**
 * 要素を縦に転がす最も近い祖先。交差は転がる箱の縁で切られるので、余白を先読みにするには根にそれを渡す。
 * 画面全体で転がる（箱が無い）ときはビューポートが根なので `undefined`。
 */
function scrollBoxOf(element: Element): Element | undefined {
  for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    const overflowY = getComputedStyle(ancestor).overflowY
    if (overflowY === "auto" || overflowY === "scroll") {
      return ancestor
    }
  }
  return undefined
}
