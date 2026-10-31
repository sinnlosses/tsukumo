// イベントリスナの登録と解除。`handler` は最新のものを読み、変わっても張り直さない。

import { useEffect, useEffectEvent } from "react"

type EventMapOf<Target extends EventTarget> = Target extends Window
  ? WindowEventMap
  : Target extends Document
    ? DocumentEventMap
    : Target extends HTMLElement
      ? HTMLElementEventMap
      : Record<string, Event>

type ListenerOptions = Partial<{
  /** 偽のあいだはリスナを張らない。既定は真。 */
  readonly enabled: boolean
  readonly capture: boolean
}>

export function useEventListener<
  Target extends EventTarget,
  Type extends keyof EventMapOf<Target> & string,
>(
  target: Target,
  type: Type,
  handler: (event: EventMapOf<Target>[Type]) => void,
  { enabled = true, capture = false }: ListenerOptions = {},
): void {
  const onEvent = useEffectEvent((event: Event) => {
    handler(event as EventMapOf<Target>[Type])
  })
  useEffect(() => {
    if (!enabled) return
    target.addEventListener(type, onEvent, { capture })
    return () => {
      target.removeEventListener(type, onEvent, { capture })
    }
  }, [target, type, enabled, capture])
}
