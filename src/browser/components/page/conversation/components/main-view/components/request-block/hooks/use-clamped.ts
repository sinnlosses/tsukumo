// 行数で切った字が実際に切れているか(隠れた続きがあるか)を測る。幅が変わるたびに測り直す。

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

export function useClamped(): {
  readonly ref: RefObject<HTMLElement | null>
  readonly clamped: boolean
} {
  const ref = useRef<HTMLElement>(null)
  const [clamped, setClamped] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) {
      return undefined
    }
    const measure = (): void => {
      setClamped(element.scrollHeight > element.clientHeight)
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
