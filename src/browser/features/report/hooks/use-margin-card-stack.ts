// 本文の根の中の余白の札（`data-margin-card`）を測り、重なる札を下へずらす量と、根の末尾に足す余白を求める。
// 札は部品ごとの外枠の中に置かれるので、部品をまたぐ重なりは根で測る。
// 札が自分の部品より下へ伸びたら、その横に来る塊（欄と `Column` の直下の要素）に印（`data-beside-card`）を付け、CSS が右を空ける。
// 塊は React が描く要素と Markdown の変換が出す要素が混ざるので、印は測ったその場で DOM に付け外しする。

import { type RefObject, useState } from "react"

import { useMountEffect } from "../../../hooks/use-mount-effect.ts"
import { blocksBesideCards, stackMarginCards } from "../domain/margin-card-stack.ts"

export type MarginCardStack = {
  /** 札の `data-margin-card` ごとの、下へずらす量。 */
  readonly shifts: Readonly<Record<string, number>>
  /** 根の下端を越える札のために、根の末尾へ足す高さ。 */
  readonly tail: number
}

const CARD_GAP = 8
const BLOCK_SELECTOR = ":is([data-report-region], [data-part-column]) > :not([data-part-column])"
/** `Row` は丸ごと1つの塊として右を空ける（セルの中の塊には印を付けない）。 */
const ROW_SELECTOR = "[data-part-row]"
const BESIDE_CARD_ATTRIBUTE = "data-beside-card"
/** 自分の札のために余白の列を空けている外枠の印。 */
const OWN_MARGIN_ATTRIBUTE = "data-reply-margin"

export function useMarginCardStack(
  rootRef: RefObject<HTMLElement | null>,
  tailRef: RefObject<HTMLElement | null>,
): {
  readonly stack: MarginCardStack
  /** いまの DOM を測り直す。描画の前に札と印をそろえたいときに呼ぶ。 */
  readonly measure: () => void
} {
  const [stack, setStack] = useState<MarginCardStack>({ shifts: {}, tail: 0 })
  const measure = () => {
    const root = rootRef.current
    if (root === null) {
      return
    }
    const measured = measureCards(root, tailRef.current?.offsetHeight ?? 0)
    setStack((current) =>
      JSON.stringify(current) === JSON.stringify(measured.stack) ? current : measured.stack,
    )
    markBlocksBesideCards(root, measured.placed)
  }
  useMountEffect(() => {
    const root = rootRef.current
    if (root === null) {
      return
    }
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(root, { subtree: true, childList: true, attributes: true })
    return () => {
      observer.disconnect()
    }
  })
  return { stack, measure }
}

/** 置いたあとの札。位置は本文の根の左上から。 */
type PlacedCard = {
  readonly element: HTMLElement
  readonly top: number
  readonly height: number
  readonly left: number
}

function measureCards(
  root: HTMLElement,
  tailHeight: number,
): { readonly stack: MarginCardStack; readonly placed: readonly PlacedCard[] } {
  const rootRect = root.getBoundingClientRect()
  const cards = [...root.querySelectorAll<HTMLElement>("[data-margin-card]")]
  const slots = cards.map((card) => {
    const frameTop = card.closest("[data-reply-frame]")?.getBoundingClientRect().top ?? rootRect.top
    return {
      id: card.dataset["marginCard"] ?? "",
      top: frameTop - rootRect.top + Number(card.dataset["cardTop"] ?? 0),
      height: card.offsetHeight,
    }
  })
  const naturalTops = new Map(slots.map((slot) => [slot.id, slot.top]))
  const elements = new Map(cards.map((card) => [card.dataset["marginCard"] ?? "", card]))
  const stacked = stackMarginCards(slots, CARD_GAP)
  const shifts = Object.fromEntries(
    stacked.map((card) => [card.id, card.top - (naturalTops.get(card.id) ?? card.top)]),
  )
  const cardsBottom = Math.max(0, ...stacked.map((card) => card.top + card.height))
  return {
    stack: { shifts, tail: Math.ceil(Math.max(0, cardsBottom - (rootRect.height - tailHeight))) },
    placed: stacked.flatMap((card) => {
      const element = elements.get(card.id)
      return element === undefined
        ? []
        : [
            {
              element,
              top: card.top,
              height: card.height,
              left: element.getBoundingClientRect().left - rootRect.left,
            },
          ]
    }),
  }
}

/**
 * 札の横に来た塊に印を付け、外れた塊から印を外す。
 * 塊の右端は、印で空けた分（右の margin）を足して測る（印の有無で右端が動くと、付け外しが往復する）。
 */
function markBlocksBesideCards(root: HTMLElement, placed: readonly PlacedCard[]): void {
  const rootRect = root.getBoundingClientRect()
  const blocks =
    placed.length === 0
      ? []
      : [...root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)].filter(
          (block) =>
            !block.hasAttribute(OWN_MARGIN_ATTRIBUTE) &&
            (block.parentElement?.closest(ROW_SELECTOR) ?? undefined) === undefined,
        )
  const beside = blocksBesideCards(
    blocks.map((block) => {
      const rect = block.getBoundingClientRect()
      return {
        top: rect.top - rootRect.top,
        bottom: rect.bottom - rootRect.top,
        right: rect.right - rootRect.left + (parseFloat(getComputedStyle(block).marginRight) || 0),
      }
    }),
    placed.map((card) => ({
      top: card.top,
      bottom: card.top + card.height,
      left: card.left,
      holders: blocks.flatMap((block, index) => (block.contains(card.element) ? [index] : [])),
    })),
    CARD_GAP,
  )
  const marked = new Set<Element>(blocks.filter((_, index) => beside[index] === true))
  for (const block of root.querySelectorAll(`[${BESIDE_CARD_ATTRIBUTE}]`)) {
    if (!marked.has(block)) {
      block.removeAttribute(BESIDE_CARD_ATTRIBUTE)
    }
  }
  for (const block of marked) {
    if (!block.hasAttribute(BESIDE_CARD_ATTRIBUTE)) {
      block.setAttribute(BESIDE_CARD_ATTRIBUTE, "")
    }
  }
}
