// 仕切り1本ぶんのドラッグ配線。新しい依存は足さず、素の `pointerdown` / `pointermove` /
// `pointerup` で書く（`docs/coding-standards.md`「Bun固有APIに寄せない」と同じ考えで、
// ブラウザ標準の API に留める）。

import { useEffectEvent, type PointerEvent, type ReactElement, type RefObject } from "react"

import styles from "./layout.module.css"
import { clampPercent } from "./split.ts"

export type LayoutResizerProps = {
  readonly orientation: "horizontal" | "vertical"
  /** percent の基準にする要素（仕切りの両側を含む、動かす対象そのもの）。 */
  readonly containerRef: RefObject<HTMLElement | null>
  readonly ariaLabel: string
  /** ドラッグ中、位置（%）が変わるたびに呼ばれる。 */
  readonly onChange: (percent: number) => void
  /**
   * ドラッグが終わったら、最後に渡した位置（%）で1回だけ呼ばれる（保存のタイミング）。
   * **一度も動かさずに離したときは呼ばない**（保存する変化が無く、仕切りを掴んだだけで
   * 位置が動いて見えるのを防ぐ）。
   */
  readonly onCommit: (percent: number) => void
}

export function LayoutResizer(props: LayoutResizerProps): ReactElement {
  // `pointerdown` で登録するリスナはドラッグが終わるまで生き続けるので、素のクロージャだと
  // `pointerdown` の時点の props を握ったままになる。`useEffectEvent` で包むと、呼ぶのは
  // いつも最新のハンドラになる（`docs/coding-standards.md`「React」節）。
  const change = useEffectEvent((percent: number): void => {
    props.onChange(percent)
  })
  const commit = useEffectEvent((percent: number): void => {
    props.onCommit(percent)
  })

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    const target = event.currentTarget
    if (typeof target.setPointerCapture === "function") {
      target.setPointerCapture(event.pointerId)
    }
    const rect = props.containerRef.current?.getBoundingClientRect()
    if (rect === undefined) {
      return
    }

    // ドラッグ中に最後に渡した位置。一度も動かさずに離したかどうかは、これが未定義かで分かる。
    let lastPercent: number | undefined
    const onMove = (moveEvent: globalThis.PointerEvent): void => {
      const raw =
        props.orientation === "horizontal"
          ? ((moveEvent.clientY - rect.top) / rect.height) * 100
          : ((moveEvent.clientX - rect.left) / rect.width) * 100
      lastPercent = clampPercent(raw)
      change(lastPercent)
    }
    const onUp = (): void => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
      if (lastPercent !== undefined) {
        commit(lastPercent)
      }
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }

  return (
    <div
      className={`${styles["layout-resizer"]} ${styles[`layout-resizer-${props.orientation}`]}`}
      role="separator"
      aria-orientation={props.orientation}
      aria-label={props.ariaLabel}
      onPointerDown={onPointerDown}
    />
  )
}
