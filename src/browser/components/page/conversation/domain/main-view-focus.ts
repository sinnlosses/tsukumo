/** メインビューの根に付ける印。 */
export const MAIN_VIEW_ATTRIBUTE = "data-main-view"

export function isFocusWithinMainView(): boolean {
  const found = document.activeElement?.closest(`[${MAIN_VIEW_ATTRIBUTE}]`)
  return found !== null && found !== undefined
}
