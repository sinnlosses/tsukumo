// レポートの本文で字を選び終えたとき（`pointerup`・選択を動かすキーの `keyup`）、選んだ字を引く口の位置と引用を持つ。
// 口は選んだ字の行の高さで、本文の右端にそろえて出す。
// 本文の中の選択が無くなったとき・スクロールしたとき・Esc で口を消す。

import { type RefObject, useState } from "react"

import { useEventListener } from "../../../hooks/use-event-listener.ts"
import { quoteOf } from "../domain/selection-quote.ts"
import { reportSelectionOf, type ReportSelection } from "../domain/selection-range.ts"

export type SelectionPoint =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly quote: string
      /** 口の上端（ビューポートの座標）。 */
      readonly top: number
      /** 口の右端をそろえる位置（ビューポートの座標）。 */
      readonly right: number
    }

const NONE: SelectionPoint = { kind: "none" }

const SELECTION_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"])

export function useSelectionPoint(rootRef: RefObject<HTMLElement | null>): {
  readonly point: SelectionPoint
  readonly dismiss: () => void
} {
  const [point, setPoint] = useState<SelectionPoint>(NONE)
  // スクロール・選択の変化のたびに呼ばれるので、口が出ていなければ状態を変えず描き直さない
  const dismiss = () => {
    setPoint((current) => (current.kind === "none" ? current : NONE))
  }
  const read = () => {
    const root = rootRef.current
    const selection = reportSelectionOf(document.getSelection() ?? undefined)
    if (root === null || selection === undefined || !root.contains(selection.element)) {
      return
    }
    setPoint({
      kind: "shown",
      quote: quoteOf(selection.text),
      top: selection.anchor.top,
      right: root.getBoundingClientRect().right,
    })
  }
  useEventListener(document, "pointerup", read)
  useEventListener(document, "keyup", (event) => {
    if (isSelectionKey(event)) {
      read()
    }
  })
  useEventListener(document, "selectionchange", () => {
    const selection = reportSelectionOf(document.getSelection() ?? undefined)
    if (!isInside(rootRef.current ?? undefined, selection)) {
      dismiss()
    }
  })
  useEventListener(document, "keydown", (event) => {
    if (event.key === "Escape") {
      dismiss()
    }
  })
  useEventListener(document, "scroll", dismiss, { capture: true })
  return { point, dismiss }
}

function isInside(root?: Element, selection?: ReportSelection): boolean {
  return root !== undefined && selection !== undefined && root.contains(selection.element)
}

/** 選択の範囲を動かしうるキー（矢印・Home・End、Shift・Cmd・Ctrl つきのキー）。 */
function isSelectionKey(event: KeyboardEvent): boolean {
  return SELECTION_KEYS.has(event.key) || event.shiftKey || event.metaKey || event.ctrlKey
}
