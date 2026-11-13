// 外枠の中の指せる単位の DOM を引く・測る。

import { type ReplyUnit, replyUnitOf, UNIT_SELECTOR } from "../domain/reply-unit.ts"

/** 押しても単位を指さない要素（単位の中のボタン・リンク・入力）。 */
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, summary, label"

export type AskScope =
  | { readonly kind: "leaf" }
  | { readonly kind: "row"; readonly index: number; readonly firstCell: string }

export type MarginTops = {
  /** 指した単位の上端（外枠の上端から）。 */
  readonly pointed: number
  /** 札を置く単位ごとの上端（`scopeKeyOf` の鍵）。 */
  readonly cards: Readonly<Record<string, number>>
}

export function scopeKeyOf(scope: AskScope): string {
  return scope.kind === "leaf" ? "leaf" : `row:${String(scope.index)}`
}

/** 押した要素を含む外枠の中の単位を指す。単位の中のボタンなどを押したときと、単位の外を押したときは指さない。 */
export function pointAt(
  target: EventTarget,
  frame: Element,
  leafKey: string,
  point: (unit: ReplyUnit) => void,
): void {
  if (!(target instanceof Element) || target.closest(INTERACTIVE_SELECTOR) !== null) {
    return
  }
  const unit = target.closest(UNIT_SELECTOR)
  if (unit !== null && frame.contains(unit)) {
    point(replyUnitOf(unit, leafKey))
  }
}

/** 単位の要素を外枠の中から引く選択子。 */
export function scopeSelectorOf(scope: AskScope): string {
  return scope.kind === "leaf"
    ? '[data-reply-unit="leaf"]'
    : `[data-reply-row="${String(scope.index)}"]`
}

export function unitSelectorOf(unit: ReplyUnit): string {
  return scopeSelectorOf(unitScopeOf(unit))
}

export function unitScopeOf(unit: ReplyUnit): AskScope {
  return unit.row === undefined
    ? { kind: "leaf" }
    : { kind: "row", index: unit.row.index, firstCell: unit.row.firstCell }
}

export function marginTopsOf(
  frame: HTMLElement,
  cardScopes: readonly AskScope[],
  pointedSelector?: string,
): MarginTops {
  const base = frame.getBoundingClientRect().top
  const topOf = (element?: Element) =>
    element === undefined ? 0 : Math.round(element.getBoundingClientRect().top - base)
  return {
    pointed:
      pointedSelector === undefined ? 0 : topOf(frame.querySelector(pointedSelector) ?? undefined),
    cards: Object.fromEntries(
      cardScopes.map((scope) => [
        scopeKeyOf(scope),
        topOf(frame.querySelector(scopeSelectorOf(scope)) ?? undefined),
      ]),
    ),
  }
}
