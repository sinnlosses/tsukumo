/** メインビューの根に付ける印。 */
const MAIN_VIEW_ATTRIBUTE = "data-main-view"

export function isFocusWithinMainView(activeElement?: Element): boolean {
  const found = activeElement?.closest(`[${MAIN_VIEW_ATTRIBUTE}]`)
  return found !== null && found !== undefined
}
