// ワークフローの並びの行を、つかむ点で並べ替える操作。
// ポインタは押してから離すまで、キーボードは Space でつかんでから Space で置くまで、置き場所だけを動かし、
// 置いたときに1回だけ `onReorder` を呼ぶ。
// 結果は `announcement` の1文で読み上げに渡す。

import { useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react"

import {
  dropIndexAt,
  nextStepGrab,
  type StepGrab,
  type StepGrabAction,
  type StepGrabOutcome,
  type StepRowBounds,
} from "../domain/step-reorder.ts"

/** つかんでいる行と置き場所。`offsetY` はポインタで動かした縦の量で、キーボードでは 0。 */
export type StepGrabView =
  | { readonly kind: "idle" }
  | {
      readonly kind: "grabbed"
      readonly from: number
      readonly to: number
      readonly offsetY: number
    }

export type StepGrabHandlers = {
  readonly onPointerDown: (index: number, event: PointerEvent<HTMLElement>) => void
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void
  readonly onPointerCancel: () => void
  readonly onKeyDown: (index: number, event: KeyboardEvent<HTMLElement>) => void
  readonly onBlur: () => void
}

type StepDrag =
  | { readonly kind: "idle" }
  | { readonly kind: "keyboard"; readonly from: number; readonly to: number }
  | {
      readonly kind: "pointer"
      readonly from: number
      readonly to: number
      readonly pointerId: number
      readonly startY: number
      readonly offsetY: number
      /** つかんだ時点の行の矩形。動かしているあいだは測り直さない。 */
      readonly rows: readonly StepRowBounds[]
    }

export function useStepGrab(props: {
  /** 並びの行の名前（`title`）。添字は並びの順。 */
  readonly titles: readonly string[]
  readonly enabled: boolean
  readonly listRef: RefObject<HTMLOListElement | null>
  readonly onReorder: (from: number, to: number) => void
}): {
  readonly view: StepGrabView
  readonly announcement: string
  readonly handlers: StepGrabHandlers
} {
  const { titles, enabled, listRef, onReorder } = props
  const [drag, setDrag] = useState<StepDrag>({ kind: "idle" })
  const [announcement, setAnnouncement] = useState("")

  const titleAt = (index: number): string => titles[index] ?? ""

  const settle = (outcome: StepGrabOutcome): void => {
    switch (outcome.kind) {
      case "none":
        return
      case "moved":
        onReorder(outcome.from, outcome.to)
        setAnnouncement(`${titleAt(outcome.from)} を ${outcome.to + 1} 番目へ置いた`)
        return
      case "placed":
        setAnnouncement(`${titleAt(outcome.index)} を ${outcome.index + 1} 番目のまま置いた`)
        return
      case "cancelled":
        setAnnouncement(`${titleAt(outcome.index)} を ${outcome.index + 1} 番目へ戻した`)
        return
    }
  }

  const handlers: StepGrabHandlers = {
    onPointerDown: (index, event) => {
      if (!enabled || drag.kind !== "idle" || event.button !== 0 || titles.length < 2) {
        return
      }
      const list = listRef.current
      if (list === null) {
        return
      }
      const target = event.currentTarget
      if (typeof target.setPointerCapture === "function") {
        target.setPointerCapture(event.pointerId)
      }
      setDrag({
        kind: "pointer",
        from: index,
        to: index,
        pointerId: event.pointerId,
        startY: event.clientY,
        offsetY: 0,
        rows: Array.from(list.children, (row) => row.getBoundingClientRect()),
      })
    },
    onPointerMove: (event) => {
      if (drag.kind !== "pointer" || event.pointerId !== drag.pointerId) {
        return
      }
      setDrag({
        ...drag,
        offsetY: event.clientY - drag.startY,
        to: dropIndexAt(drag.rows, drag.from, event.clientY),
      })
    },
    onPointerUp: (event) => {
      if (drag.kind !== "pointer" || event.pointerId !== drag.pointerId) {
        return
      }
      setDrag({ kind: "idle" })
      settle(
        drag.from === drag.to
          ? { kind: "placed", index: drag.from }
          : { kind: "moved", from: drag.from, to: drag.to },
      )
    },
    onPointerCancel: () => {
      if (drag.kind === "pointer") {
        setDrag({ kind: "idle" })
      }
    },
    onKeyDown: (index, event) => {
      const action = grabActionOf(event.key)
      if (!enabled || drag.kind === "pointer" || action === "other") {
        return
      }
      const grab: StepGrab =
        drag.kind === "keyboard"
          ? { kind: "grabbed", from: drag.from, to: drag.to }
          : { kind: "idle" }
      if (grab.kind === "idle" && action !== "toggle") {
        return
      }
      // つかんでいるあいだの Esc で、外側のダイアログまで閉じないよう伝播を止める。
      event.preventDefault()
      event.stopPropagation()
      const next = nextStepGrab(grab, index, action, titles.length)
      setDrag(
        next.grab.kind === "grabbed"
          ? { kind: "keyboard", from: next.grab.from, to: next.grab.to }
          : { kind: "idle" },
      )
      if (next.grab.kind === "grabbed") {
        setAnnouncement(
          grab.kind === "idle"
            ? `${titleAt(next.grab.from)} をつかんだ（${next.grab.from + 1} 番目）。↑↓ で動かし、Space で置く。Esc で戻す`
            : `${titleAt(next.grab.from)} を ${next.grab.to + 1} 番目へ`,
        )
      }
      settle(next.outcome)
    },
    onBlur: () => {
      if (drag.kind === "keyboard") {
        setDrag({ kind: "idle" })
        settle({ kind: "cancelled", index: drag.from })
      }
    },
  }

  return {
    view:
      drag.kind === "idle"
        ? drag
        : {
            kind: "grabbed",
            from: drag.from,
            to: drag.to,
            offsetY: drag.kind === "pointer" ? drag.offsetY : 0,
          },
    announcement,
    handlers,
  }
}

function grabActionOf(key: string): StepGrabAction | "other" {
  switch (key) {
    case " ":
      return "toggle"
    case "ArrowUp":
      return "up"
    case "ArrowDown":
      return "down"
    case "Escape":
      return "cancel"
    default:
      return "other"
  }
}
