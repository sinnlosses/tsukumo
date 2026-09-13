// 仕切り1本ぶんのドラッグ配線。新しい依存は足さず、素の `pointerdown` / `pointermove` /
// `pointerup` で書く（`docs/coding-standards.md`「Bun固有APIに寄せない」と同じ考えで、
// ブラウザ標準の API に留める）。

import { type PointerEvent, type ReactElement, type RefObject } from "react"

import { clampPercent } from "./split.ts"

export type LayoutResizerProps = {
  readonly orientation: "horizontal" | "vertical"
  /** percent の基準にする要素（仕切りの両側を含む、動かす対象そのもの）。 */
  readonly containerRef: RefObject<HTMLElement | null>
  readonly ariaLabel: string
  /** ドラッグ中、位置（%）が変わるたびに呼ばれる。 */
  readonly onChange: (percent: number) => void
  /** ドラッグが終わったら1回呼ばれる（保存のタイミング）。 */
  readonly onCommit: () => void
}

export function LayoutResizer(props: LayoutResizerProps): ReactElement {
  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    const target = event.currentTarget
    if (typeof target.setPointerCapture === "function") {
      target.setPointerCapture(event.pointerId)
    }
    const rect = props.containerRef.current?.getBoundingClientRect()
    if (rect === undefined) {
      return
    }

    const onMove = (moveEvent: globalThis.PointerEvent): void => {
      const raw =
        props.orientation === "horizontal"
          ? ((moveEvent.clientY - rect.top) / rect.height) * 100
          : ((moveEvent.clientX - rect.left) / rect.width) * 100
      props.onChange(clampPercent(raw))
    }
    const onUp = (): void => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
      props.onCommit()
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }

  return (
    <div
      className={`layout-resizer layout-resizer-${props.orientation}`}
      role="separator"
      aria-orientation={props.orientation}
      aria-label={props.ariaLabel}
      onPointerDown={onPointerDown}
    />
  )
}
