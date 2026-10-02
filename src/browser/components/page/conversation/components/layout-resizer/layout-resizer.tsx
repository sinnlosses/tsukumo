// 仕切り1本ぶんのドラッグ配線。素の `pointerdown` / `pointermove` / `pointerup` で書く。

import clsx from "clsx"
import { useEffectEvent, type PointerEvent, type ReactElement, type RefObject } from "react"

import styles from "./layout-resizer.module.css"

export type LayoutResizerProps = {
  readonly orientation: "horizontal" | "vertical"
  /** 動かす対象そのもの（仕切りの両側を含む要素）。`toValue` の比率の基準にする。 */
  readonly containerRef: RefObject<HTMLElement | null>
  readonly ariaLabel: string
  /** pointer の位置を `containerRef` の中の比率（0〜1）に換えたものから、呼び出し側の単位の値を作る。 */
  readonly toValue: (ratio: number, rect: DOMRect) => number
  /** ドラッグ中、値が変わるたびに呼ばれる。 */
  readonly onChange: (value: number) => void
  /**
   * ドラッグが終わったら、最後に渡した値で1回だけ呼ばれる（保存のタイミング）。
   * 一度も動かさずに離したときは呼ばない（仕切りを掴んだだけで位置が動いて見えるのを防ぐ）。
   */
  readonly onCommit: (value: number) => void
  /** 置き方だけを渡す。 */
  readonly className: string
}

export function LayoutResizer(props: LayoutResizerProps): ReactElement {
  // `pointerdown` で登録するリスナはドラッグが終わるまで生き続けるので、素のクロージャだと `pointerdown` の時点の props を握ったままになる。
  // `useEffectEvent` で包むと、呼ぶのはいつも最新のハンドラになる。
  const change = useEffectEvent((value: number): void => {
    props.onChange(value)
  })
  const commit = useEffectEvent((value: number): void => {
    props.onCommit(value)
  })
  const toValue = useEffectEvent((ratio: number, rect: DOMRect): number => {
    return props.toValue(ratio, rect)
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

    // ドラッグ中に最後に渡した値。一度も動かさずに離したかどうかは、これが未定義かで分かる。
    let lastValue: number | undefined
    const onMove = (moveEvent: globalThis.PointerEvent): void => {
      const ratio =
        props.orientation === "horizontal"
          ? (moveEvent.clientY - rect.top) / rect.height
          : (moveEvent.clientX - rect.left) / rect.width
      lastValue = toValue(ratio, rect)
      change(lastValue)
    }
    const onUp = (): void => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
      if (lastValue !== undefined) {
        commit(lastValue)
      }
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }

  return (
    <div
      className={clsx(
        styles["layout-resizer"],
        styles[`layout-resizer-${props.orientation}`],
        props.className,
      )}
      role="separator"
      aria-orientation={props.orientation}
      aria-label={props.ariaLabel}
      onPointerDown={onPointerDown}
    />
  )
}
