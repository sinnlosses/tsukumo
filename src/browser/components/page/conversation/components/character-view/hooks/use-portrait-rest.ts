// 立ち絵の呼吸を止めてよいほど、何も起きていないか。
// 最後のイベント（姿の参照が替わる）か利用者の操作から `PORTRAIT_REST_MS` 経つと true になる。
// 姿は描画では読まず store の購読で見るので、イベントごとに描き直さない。

import { useEffect, useState } from "react"

import { useSession } from "../../../../../../stores/session.ts"

export const PORTRAIT_REST_MS = 60_000

const OPERATION_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const

export function usePortraitRest(): boolean {
  const [rested, setRested] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // 同じ値の `setRested` でも React が1回描き直しを試みるので、変わるときだけ呼ぶ。
    let isRested = false
    const settle = (next: boolean): void => {
      if (next !== isRested) {
        isRested = next
        setRested(next)
      }
    }
    const rearm = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      settle(false)
      timer = setTimeout(() => settle(true), PORTRAIT_REST_MS)
    }

    rearm()
    for (const type of OPERATION_EVENTS) {
      window.addEventListener(type, rearm, { passive: true })
    }
    const unsubscribe = useSession.subscribe((current, previous) => {
      if (current.state !== previous.state) {
        rearm()
      }
    })
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      for (const type of OPERATION_EVENTS) {
        window.removeEventListener(type, rearm)
      }
      unsubscribe()
    }
  }, [])

  return rested
}
