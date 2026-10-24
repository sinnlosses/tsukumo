// 要素が、転がる箱の窓（の少し手前）に一度でも見えたかを返すフック。一度 true になったら戻さない。
// 畳んだ中・display: none の中は交差しないので、見えるまで false のまま。

import { useEffect, useState, type RefObject } from "react"

const SEEN_MARGIN = "200px"

export function useSeenOnce(ref: RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (seen || element === null) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { root: scrollBoxOf(element), rootMargin: SEEN_MARGIN },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref, seen])

  return seen
}

/**
 * 要素を縦に転がす最も近い祖先。交差は転がる箱の縁で切られるので、余白を先読みにするには根にそれを渡す。
 * 画面全体で転がる（箱が無い）ときは窓が根なので `null`。
 */
function scrollBoxOf(element: Element): Element | null {
  for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    const overflowY = getComputedStyle(ancestor).overflowY
    if (overflowY === "auto" || overflowY === "scroll") {
      return ancestor
    }
  }
  return null
}
