// 次の一手の札の並びの上の仕切り。並びの高さの上限をドラッグで変え、`localStorage` に保つ。
// ドラッグの間は描き直さず、並びの器へ直接 `--next-step-chips-max-height` を書く。

import { useRef, useState, type CSSProperties, type RefObject } from "react"

import {
  loadNextStepTrayHeight,
  nextStepTrayHeightAt,
  resetNextStepTrayHeight,
  saveNextStepTrayHeight,
} from "../domain/next-step-tray-height.ts"

type NextStepTrayHeight = {
  /** 仕切りを包む箱。中心を掴む位置とみなす。 */
  readonly gripRef: RefObject<HTMLDivElement | null>
  /** 札の並び。仕切りのドラッグが比率の基準にする。 */
  readonly chipsRef: RefObject<HTMLDivElement | null>
  readonly style: CSSProperties
  readonly toValue: (ratio: number, rect: DOMRect) => number
  readonly onChange: (px: number) => void
  readonly onCommit: (px: number) => void
  readonly onReset: () => void
}

const MAX_HEIGHT_VARIABLE = "--next-step-chips-max-height"

export function useNextStepTrayHeight(): NextStepTrayHeight {
  const gripRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const [heightPx, setHeightPx] = useState(loadNextStepTrayHeight)

  return {
    gripRef,
    chipsRef,
    style: heightPx === undefined ? {} : { [MAX_HEIGHT_VARIABLE]: `${String(heightPx)}px` },
    toValue: (ratio, rect) => {
      const grip = gripRef.current?.getBoundingClientRect()
      const chips = chipsRef.current
      const chipsTop = chips?.getBoundingClientRect().top ?? rect.top
      const gripCenter = grip === undefined ? chipsTop : grip.top + grip.height / 2
      return nextStepTrayHeightAt({
        pointerY: rect.top + ratio * rect.height,
        chipsBottom: rect.bottom,
        gripGap: chipsTop - gripCenter,
        contentHeight: chips?.scrollHeight ?? rect.height,
      })
    },
    onChange: (px) => {
      chipsRef.current?.style.setProperty(MAX_HEIGHT_VARIABLE, `${String(px)}px`)
    },
    onCommit: (px) => {
      setHeightPx(px)
      saveNextStepTrayHeight(px)
    },
    onReset: () => {
      chipsRef.current?.style.removeProperty(MAX_HEIGHT_VARIABLE)
      setHeightPx(undefined)
      resetNextStepTrayHeight()
    },
  }
}
