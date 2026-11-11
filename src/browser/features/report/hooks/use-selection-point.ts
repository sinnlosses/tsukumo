// レポートの本文で字を選び終えたとき（`pointerup`・選択を動かすキーの `keyup`）、選んだ字の行き先を決める。
// 字が指せる単位の外枠の中なら、その単位（単位の外なら部品全体）を引用つきで指す。
// 外枠の外（頭の欄・図・配置の部品）なら、入力欄へ引用を入れる口を出す位置を返す。
// 口の位置は、余白の列を出している幅（外枠が grid）なら余白の左端、出さない幅なら本文の右端にそろえる。

import type { RefObject } from "react"

import { useEventListener } from "../../../hooks/use-event-listener.ts"
import { type ReplyUnit, replyUnitOf, UNIT_SELECTOR } from "../domain/reply-unit.ts"
import { quoteOf } from "../domain/selection-quote.ts"
import { reportSelectionOf, type ReportSelection } from "../domain/selection-range.ts"

export type SelectionOutside =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly quote: string
      /** 口の上端（ビューポートの座標）。 */
      readonly top: number
      /** `start` は口の左端を、`end` は口の右端を `left` にそろえる。 */
      readonly align: "start" | "end"
      readonly left: number
    }

type SelectionHandlers = {
  readonly onUnit: (unit: ReplyUnit, quote: string) => void
  readonly onOutside: (shown: Extract<SelectionOutside, { readonly kind: "shown" }>) => void
  /** 本文の中の選択が無くなったとき・スクロールしたとき・Esc。 */
  readonly onLeave: () => void
}

const SELECTION_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"])

export function useSelectionPoint(
  rootRef: RefObject<HTMLElement | null>,
  handlers: SelectionHandlers,
): void {
  const read = () => {
    const root = rootRef.current
    const selection = reportSelectionOf(document.getSelection() ?? undefined)
    if (root === null || selection === undefined || !root.contains(selection.element)) {
      return
    }
    const quote = quoteOf(selection.text)
    const frame = selection.element.closest("[data-reply-frame]")
    if (frame !== null && root.contains(frame)) {
      const leafKey = frame.getAttribute("data-reply-frame") ?? ""
      const unit = selection.element.closest(UNIT_SELECTOR)
      handlers.onUnit(
        unit !== null && frame.contains(unit) ? replyUnitOf(unit, leafKey) : { leafKey },
        quote,
      )
      return
    }
    handlers.onOutside({ kind: "shown", quote, top: selection.anchor.top, ...placeOf(root) })
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
      handlers.onLeave()
    }
  })
  useEventListener(document, "keydown", (event) => {
    if (event.key === "Escape") {
      handlers.onLeave()
    }
  })
  useEventListener(document, "scroll", handlers.onLeave, { capture: true })
}

/** 余白の列を出している外枠があれば余白の左端、無ければ本文の右端。 */
function placeOf(root: Element): { readonly align: "start" | "end"; readonly left: number } {
  const frame = root.querySelector("[data-reply-frame]")
  const margin = frame?.lastElementChild ?? undefined
  if (frame !== null && margin !== undefined && getComputedStyle(frame).display === "grid") {
    return { align: "start", left: margin.getBoundingClientRect().left }
  }
  return { align: "end", left: root.getBoundingClientRect().right }
}

function isInside(root?: Element, selection?: ReportSelection): boolean {
  return root !== undefined && selection !== undefined && root.contains(selection.element)
}

/** 選択の範囲を動かしうるキー（矢印・Home・End、Shift・Cmd・Ctrl つきのキー）。 */
function isSelectionKey(event: KeyboardEvent): boolean {
  return SELECTION_KEYS.has(event.key) || event.shiftKey || event.metaKey || event.ctrlKey
}
