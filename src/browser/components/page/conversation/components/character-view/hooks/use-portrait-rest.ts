// 立ち絵の呼吸を止めてよいほど、何も起きていないか。
// 最後のイベント（`activity` の参照が替わる）か利用者の操作から `PORTRAIT_REST_MS` 経つと true になる。

import { useEffect, useState } from "react"

export const PORTRAIT_REST_MS = 60_000

const OPERATION_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const

const NOT_RESTED = Symbol("not-rested")

export function usePortraitRest(activity: unknown): boolean {
  // 休んだ時点の `activity` を持つ。いまの `activity` と同じ間だけ休んでいる。
  const [restedFor, setRestedFor] = useState<unknown>(NOT_RESTED)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const rearm = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      setRestedFor(NOT_RESTED)
      timer = setTimeout(() => setRestedFor(activity), PORTRAIT_REST_MS)
    }

    rearm()
    for (const type of OPERATION_EVENTS) {
      window.addEventListener(type, rearm, { passive: true })
    }
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      for (const type of OPERATION_EVENTS) {
        window.removeEventListener(type, rearm)
      }
    }
  }, [activity])

  return restedFor === activity
}
