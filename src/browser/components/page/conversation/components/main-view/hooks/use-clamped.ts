// 1行に収めた字が実際に省略されているか(隠れた続きがあるか)を測る。幅が変わるたびに測り直す。

import { useState, type RefCallback } from "react"

import { useResizeObservedRef } from "../../../../../../hooks/use-observed-ref.ts"

export function useClamped<Element extends HTMLElement>(): {
  readonly ref: RefCallback<Element>
  readonly clamped: boolean
} {
  const [clamped, setClamped] = useState(false)
  const ref = useResizeObservedRef<Element>(
    (element) => {
      setClamped(element.scrollWidth > element.clientWidth)
    },
    () => {},
  )
  return { ref, clamped }
}
