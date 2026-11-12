// 余白の札を、指した単位の上端の高さに置き、前の札と重なるなら下へずらす。

import { sortBy } from "remeda"

export type MarginCardSlot = {
  readonly id: string
  /** 指した単位の上端。 */
  readonly top: number
  readonly height: number
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
