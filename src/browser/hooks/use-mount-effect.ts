// マウント時に1回だけ走る effect と、外れるときだけ走る後始末。
// 値が変わるたびに同期し直したいものには使わない（`useExternalSync`）。

import { useEffect, useEffectEvent } from "react"

export function useMountEffect(effect: () => void | (() => void)): void {
  const run = useEffectEvent(effect)
  useEffect(() => run(), [])
}

export function useUnmountEffect(cleanup: () => void): void {
  const run = useEffectEvent(cleanup)
  useEffect(
    () => () => {
      run()
    },
    [],
  )
}
