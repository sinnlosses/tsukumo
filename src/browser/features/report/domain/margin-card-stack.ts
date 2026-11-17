// 余白の札を、指した単位の上端の高さに置き、前の札と重なるなら下へずらす。
// 札が自分の部品より下へ伸びたとき、その横に来る塊を求める。

import { sortBy } from "remeda"

export type MarginCardSlot = {
  readonly id: string
  /** 指した単位の上端。 */
  readonly top: number
  readonly height: number
}

/** 本文の根から測った塊の縦の範囲と右端。 */
export type BlockSpan = {
  readonly top: number
  readonly bottom: number
  readonly right: number
}

/** 置いたあとの札の範囲。 */
export type PlacedCardSpan = {
  readonly top: number
  readonly bottom: number
  readonly left: number
  /** 札を中に持つ塊の添字。自分の札には右を空けない。 */
  readonly holders: readonly number[]
}

/** `top` は前の札と重ならないよう下へずらした上端。 */
export function stackMarginCards(
  cards: readonly MarginCardSlot[],
  gap: number,
): readonly MarginCardSlot[] {
  return sortBy(cards, (card) => card.top).reduce<readonly MarginCardSlot[]>((placed, card) => {
    const previous = placed.at(-1)
    const floor = previous === undefined ? card.top : previous.top + previous.height + gap
    return [...placed, { ...card, top: Math.max(card.top, floor) }]
  }, [])
}

/**
 * 塊ごとに、ほかの部品の札の横に来ているか。
 * 札の上下に `gap` を足した範囲に掛かり、右端が札の左端を越える塊が当たる。
 */
export function blocksBesideCards(
  blocks: readonly BlockSpan[],
  cards: readonly PlacedCardSpan[],
  gap: number,
): readonly boolean[] {
  return blocks.map((block, index) =>
    cards.some(
      (card) =>
        !card.holders.includes(index) &&
        block.right > card.left &&
        block.top < card.bottom + gap &&
        block.bottom > card.top - gap,
    ),
  )
}
