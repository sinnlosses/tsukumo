// 同じ要素に付く ref を1つの ref コールバックにまとめる。外れるときは付けた順に後始末する。

import type { Ref, RefCallback } from "react"

export function mergeRefs<Element>(...refs: readonly Ref<Element>[]): RefCallback<Element> {
  return (element: Element) => {
    const cleanups = refs.map((ref): (() => void) => {
      if (ref === null) {
        return () => {}
      }
      if (typeof ref === "function") {
        const cleanup = ref(element)
        return typeof cleanup === "function"
          ? cleanup
          : () => {
              ref(null)
            }
      }
      ref.current = element
      return () => {
        ref.current = null
      }
    })
    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }
}
