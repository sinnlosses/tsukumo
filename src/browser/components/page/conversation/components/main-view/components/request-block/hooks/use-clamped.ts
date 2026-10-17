// 1行に収めた字が実際に省略されているか(隠れた続きがあるか)を測る。幅が変わるたびに測り直す。

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

export function useClamped<Element extends HTMLElement>(): {
  readonly ref: RefObject<Element | null>
  readonly clamped: boolean
} {
  const ref = useRef<Element>(null)
  const [clamped, setClamped] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) {
      return undefined
    }
    const measure = (): void => {
      setClamped(element.scrollWidth > element.clientWidth)
    }
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(element)
    measure()
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return { ref, clamped }
}
