// Safari のトラックパッドのピンチ（gesturestart・gesturechange）を受け、直前からの倍率の比を渡す。
// Safari は ctrlKey 付きの wheel を出さず、ピンチは独自のジェスチャーのイベントで届く。
// gesturechange の scale は始まりからの累計なので、直前の値との比にして渡す。

import { useEffectEvent, type RefObject } from "react"

import { useExternalSync } from "../../hooks/use-external-sync.ts"

type GestureZoom = (factor: number, clientX: number, clientY: number) => void

export function useStageGesture(ref: RefObject<HTMLElement | null>, onZoom: GestureZoom): void {
  const zoom = useEffectEvent(onZoom)
  useExternalSync(() => {
    const element = ref.current
    if (element === null) {
      return undefined
    }
    let lastScale = 1
    const onStart = (event: Event) => {
      event.preventDefault()
      lastScale = 1
    }
    const onChange = (event: Event) => {
      event.preventDefault()
      const scale = scaleOf(event)
      const point = pointOf(event)
      if (scale !== undefined && point !== undefined) {
        zoom(scale / lastScale, point.x, point.y)
        lastScale = scale
      }
    }
    element.addEventListener("gesturestart", onStart)
    element.addEventListener("gesturechange", onChange)
    return () => {
      element.removeEventListener("gesturestart", onStart)
      element.removeEventListener("gesturechange", onChange)
    }
  }, [ref])
}

function scaleOf(event: Event): number | undefined {
  return "scale" in event && typeof event.scale === "number" ? event.scale : undefined
}

function pointOf(event: Event): { readonly x: number; readonly y: number } | undefined {
  return "clientX" in event &&
    typeof event.clientX === "number" &&
    "clientY" in event &&
    typeof event.clientY === "number"
    ? { x: event.clientX, y: event.clientY }
    : undefined
}
