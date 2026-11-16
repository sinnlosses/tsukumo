// 仕切り1本ぶんのドラッグ配線。素の `pointerdown` / `pointermove` / `pointerup` で書く。
// 見た目と `separator` の役は Astryx の `ResizeHandle`。`resizable` は渡さない（ドラッグはここで配線する）。

import { ResizeHandle } from "@astryxdesign/core/Resizable"
import clsx from "clsx"
import {
  useEffectEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type RefObject,
} from "react"

import styles from "./layout-resizer.module.css"

// `ResizeHandle` の `direction` は並べる向きで、仕切りの線の向き（`orientation`）と逆。
const ORIENTATION_DIRECTION = {
  vertical: "horizontal",
  horizontal: "vertical",
} satisfies Record<"horizontal" | "vertical", "horizontal" | "vertical">

type LayoutResizerProps = {
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
  /**
   * 渡すと仕切りがフォーカスを受け、矢印キー（縦の仕切りは ←→、横の仕切りは ↑↓）でこの px ずつ動く。
   * 動いた値は `onChange` と `onCommit` の両方へ渡す。
   */
  readonly keyboardStepPx?: number
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
      // oxlint-disable-next-line react/rules-of-hooks -- ドラッグの間だけ生きるリスナの中で呼ぶ（docs/coding-standards/react.md）
      lastValue = toValue(ratio, rect)
      // oxlint-disable-next-line react/rules-of-hooks -- 同上
      change(lastValue)
    }
    const onUp = (): void => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
      if (lastValue !== undefined) {
        // oxlint-disable-next-line react/rules-of-hooks -- 同上
        commit(lastValue)
      }
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }

  // 仕切りのいまの位置から1歩ずらした所を、pointer がそこにあるときと同じ比率にして値へ換える。
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = props.keyboardStepPx
    const delta = step === undefined ? 0 : stepDirection(props.orientation, event.key) * step
    const rect = props.containerRef.current?.getBoundingClientRect()
    if (delta === 0 || rect === undefined) {
      return
    }
    event.preventDefault()
    const own = event.currentTarget.getBoundingClientRect()
    const ratio =
      props.orientation === "horizontal"
        ? (own.top - rect.top + delta) / rect.height
        : (own.left - rect.left + delta) / rect.width
    const value = props.toValue(ratio, rect)
    props.onChange(value)
    props.onCommit(value)
  }

  return (
    <ResizeHandle
      className={clsx(styles[`layout-resizer-${props.orientation}`], props.className)}
      direction={ORIENTATION_DIRECTION[props.orientation]}
      label={props.ariaLabel}
      tabIndex={props.keyboardStepPx === undefined ? -1 : 0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  )
}

/** 矢印キーが仕切りを動かす向き（前へ -1・後ろへ 1）。仕切りの向きに合わないキーは 0。 */
function stepDirection(orientation: "horizontal" | "vertical", key: string): -1 | 0 | 1 {
  const [back, forward] =
    orientation === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]
  if (key === back) {
    return -1
  }
  return key === forward ? 1 : 0
}
