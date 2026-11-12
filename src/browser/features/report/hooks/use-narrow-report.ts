// 本文の根の幅が、余白の列を出すのに足りないほど狭いか。
// しきい値は ask-box.css の container query（本文 30em ＋ 余白 248px ＋ 間 24px）と揃える。

import { type RefObject, useState } from "react"

import { useMountEffect } from "../../../hooks/use-mount-effect.ts"

const BODY_MIN_EM = 30
const MARGIN_PX = 248 + 24

export function useNarrowReport(rootRef: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false)
  useMountEffect(() => {
    const root = rootRef.current
    if (root === null) {
      return
    }
    const measure = () => {
      setNarrow(isNarrow(root))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => {
      observer.disconnect()
    }
  })
  return narrow
}

/** 幅が 0（まだ置かれていない）なら広い幅として扱う。 */
function isNarrow(root: HTMLElement): boolean {
  const style = getComputedStyle(root)
  const content =
    root.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
  return content > 0 && content < BODY_MIN_EM * (parseFloat(style.fontSize) || 16) + MARGIN_PX
}
