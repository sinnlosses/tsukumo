// 立ち絵が従っているセリフの吹き出しに付ける尾。先を立ち絵の顔へ向ける。
// 向きの計算は `tailAim`、ここは画面から数を測って、計算し直す時機を張る。
//
// 計算し直すのは、流れの送り・流れと立ち絵の大きさの変化・立ち絵の絵の読み込み（表情の切り替え）・1回の動きの終わり・吹き出しの出方の終わり。
// 動きの最中は追わず、動きの止まった位置に向ける。
// 従っているセリフが替わるときは、尾を持つ吹き出しが作り直されてここが据え直される。

import { useId, useRef, useState, type ReactElement } from "react"

import type { FaceAt } from "../../../../../../shared/character-pack/character-definition.ts"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { useSession } from "../../../../../stores/session.ts"
import { faceOnScreen, tailAim, tailPath } from "./domain/tail-aim.ts"
import styles from "./main-view.module.css"

const STAGE_SELECTOR = "[data-character-stage]"
const PORTRAIT_SELECTOR = `${STAGE_SELECTOR} [data-expression]`
const SCROLLER_SELECTOR = "[data-main-view]"
const VOICE_SLOT_SELECTOR = "[data-voice-slot]"
/** 吹き出しの縁の太さ（px）。尾の描く面は縁の外枠と重なる（`.stream-aim`）ので、地の階調はこの座標で縁の内側に掛かる。 */
const BORDER_WIDTH = 1

export function StreamAim(): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const fillId = useId()
  const faceAt = useSession((session) => session.state.character?.faceAt)
  const [shape, setShape] = useState<TailShape>(NO_TAIL)

  useExternalSync(() => {
    const svg = svgRef.current
    if (svg === null) {
      return undefined
    }
    const aimAgain = (): void => {
      setShape(measuredShape(svg, faceAt))
    }
    aimAgain()

    // 流れを送るのはメインビューの外側の領域なので、どの要素の scroll も捕捉の段で拾う（scroll は泡立たない）。
    document.addEventListener("scroll", aimAgain, { capture: true, passive: true })
    const scroller = svg.closest(SCROLLER_SELECTOR)
    const onPortraitSettled = (event: Event): void => {
      if (
        event.target instanceof Element &&
        (event.target.closest(STAGE_SELECTOR) !== null || event.target === svg.parentElement)
      ) {
        aimAgain()
      }
    }
    document.addEventListener("load", onPortraitSettled, { capture: true })
    document.addEventListener("animationend", onPortraitSettled)

    const observer = new ResizeObserver(aimAgain)
    for (const target of [svg.parentElement, scroller, document.querySelector(PORTRAIT_SELECTOR)]) {
      if (target !== null) {
        observer.observe(target)
      }
    }
    return () => {
      document.removeEventListener("scroll", aimAgain, { capture: true })
      document.removeEventListener("load", onPortraitSettled, { capture: true })
      document.removeEventListener("animationend", onPortraitSettled)
      observer.disconnect()
    }
  }, [faceAt])

  return (
    <svg ref={svgRef} className={styles["stream-aim"]} aria-hidden="true">
      {shape !== NO_TAIL && (
        <>
          {/* 吹き出しの地と同じ縦の階調を、地と同じ高さ（縁の内側）に敷く。
              塗りが縁の線を越えて地へ入り込む所で地と同じ色になるので、継ぎ目の線が出ない。 */}
          <linearGradient
            id={fillId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={BORDER_WIDTH}
            x2="0"
            y2={Math.max(shape.bubbleHeight - BORDER_WIDTH, BORDER_WIDTH + 1)}
          >
            <stop offset="0" className={styles["stream-aim-fill-top"]} />
            <stop offset="1" className={styles["stream-aim-fill-bottom"]} />
          </linearGradient>
          <path className={styles["stream-aim-fill"]} d={shape.fill} fill={`url(#${fillId})`} />
          <path className={styles["stream-aim-stroke"]} d={shape.stroke} />
        </>
      )}
    </svg>
  )
}

type TailShape = {
  readonly fill: string
  readonly stroke: string
  readonly bubbleHeight: number
}

/** 尾を描かないときの形。 */
const NO_TAIL: TailShape = { fill: "", stroke: "", bubbleHeight: 0 }

/** 吹き出し（この尾の親）から立ち絵の顔へ向けた尾の形。立ち絵が見えていない（狭い画面など）なら `NO_TAIL`。 */
function measuredShape(svg: SVGSVGElement, faceAt?: FaceAt): TailShape {
  const bubble = svg.parentElement
  const portrait = document.querySelector(PORTRAIT_SELECTOR)
  const image = portrait?.querySelector("img")
  if (bubble === null || portrait === null || image === null || image === undefined) {
    return NO_TAIL
  }
  const box = portrait.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) {
    return NO_TAIL
  }
  const rect = bubble.getBoundingClientRect()
  const face = faceOnScreen({
    box,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    ...(faceAt === undefined ? {} : { faceAt }),
  })
  const path = tailPath(tailAim({ bubble: rect, face, gapBelow: gapBelow(bubble, rect) }), rect)
  return { ...path, bubbleHeight: rect.height }
}

/** 吹き出しのすぐ下に続く物までの空き（px）。声の定位置は下に入力欄が続くので 0、下に何も無ければ無限大。 */
function gapBelow(bubble: Element, rect: DOMRect): number {
  if (bubble.closest(VOICE_SLOT_SELECTOR) !== null) {
    return 0
  }
  const row = bubble.parentElement
  const below = row?.nextElementSibling ?? row?.parentElement?.nextElementSibling
  return below === null || below === undefined
    ? Number.POSITIVE_INFINITY
    : below.getBoundingClientRect().top - rect.bottom
}
