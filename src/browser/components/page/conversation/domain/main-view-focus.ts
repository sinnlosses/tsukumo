/** メインビューの根に付ける印。 */
const MAIN_VIEW_ATTRIBUTE = "data-main-view"

export function isFocusWithinMainView(activeElement: Element | null): boolean {
  const found = activeElement?.closest(`[${MAIN_VIEW_ATTRIBUTE}]`)
  return found !== null && found !== undefined
}

/** 要素を含むメインビューの根。含むものが無ければ `undefined`。 */
export function mainViewRootOf(element: Element): HTMLElement | undefined {
  const root = element.closest<HTMLElement>(`[${MAIN_VIEW_ATTRIBUTE}]`)
  return root ?? undefined
}
