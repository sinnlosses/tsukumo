// 要素の wheel を passive: false で受ける。`handler` は最新のものを読み、変わっても張り直さない。
// React の onWheel は passive で preventDefault が効かず、ピンチがページ全体の拡大になるので直に付ける。

import { useEffectEvent, type RefObject } from "react"

import { useExternalSync } from "../../hooks/use-external-sync.ts"

export function useBlockingWheel(
  ref: RefObject<HTMLElement | null>,
  handler: (event: WheelEvent) => void,
): void {
  const onWheel = useEffectEvent(handler)
  useExternalSync(() => {
    const element = ref.current
    if (element === null) {
      return undefined
    }
    const listener = (event: WheelEvent) => {
      onWheel(event)
    }
    element.addEventListener("wheel", listener, { passive: false })
    return () => {
      element.removeEventListener("wheel", listener)
    }
  }, [ref])
}
