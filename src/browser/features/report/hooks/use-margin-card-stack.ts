// 本文の根の中の余白の札（`data-margin-card`）を測り、重なる札を下へずらす量と、根の末尾に足す余白を求める。
// 札は部品ごとの外枠の中に置かれるので、部品をまたぐ重なりは根で測る。

import { type RefObject, useState } from "react"

import { useMountEffect } from "../../../hooks/use-mount-effect.ts"
import { stackMarginCards } from "../domain/margin-card-stack.ts"

export type MarginCardStack = {
  /** 札の `data-margin-card` ごとの、下へずらす量。 */
  readonly shifts: Readonly<Record<string, number>>
  /** 根の下端を越える札のために、根の末尾へ足す高さ。 */
  readonly tail: number
}

const CARD_GAP = 8

export function useMarginCardStack(
  rootRef: RefObject<HTMLElement | null>,
  tailRef: RefObject<HTMLElement | null>,
): MarginCardStack {
  const [stack, setStack] = useState<MarginCardStack>({ shifts: {}, tail: 0 })
  useMountEffect(() => {
    const root = rootRef.current
    if (root === null) {
      return
    }
    const measure = () => {
      const next = measureStack(root, tailRef.current?.offsetHeight ?? 0)
      setStack((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
    }
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(root, { subtree: true, childList: true, attributes: true })
    return () => {
      observer.disconnect()
    }
  })
  return stack
}

function measureStack(root: HTMLElement, tailHeight: number): MarginCardStack {
  const rootRect = root.getBoundingClientRect()
  const slots = [...root.querySelectorAll<HTMLElement>("[data-margin-card]")].map((card) => {
    const frameTop = card.closest("[data-reply-frame]")?.getBoundingClientRect().top ?? rootRect.top
    return {
      id: card.dataset["marginCard"] ?? "",
      top: frameTop - rootRect.top + Number(card.dataset["cardTop"] ?? 0),
      height: card.offsetHeight,
    }
  })
  const naturalTops = new Map(slots.map((slot) => [slot.id, slot.top]))
  const placed = stackMarginCards(slots, CARD_GAP)
  const shifts = Object.fromEntries(
    placed.map((card) => [card.id, card.top - (naturalTops.get(card.id) ?? card.top)]),
  )
  const cardsBottom = Math.max(0, ...placed.map((card) => card.top + card.height))
  return { shifts, tail: Math.ceil(Math.max(0, cardsBottom - (rootRect.height - tailHeight))) }
}
