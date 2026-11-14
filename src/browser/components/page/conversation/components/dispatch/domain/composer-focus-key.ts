// 入力欄へフォーカスを移すキー（`/`）を受けてよいかの判定。

export type ComposerFocusKeyEvent = {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly isComposing: boolean
  readonly target?: EventTarget
}

const EDITABLE = "input, textarea, select, [contenteditable]"

/** 入力要素の中・変換中・修飾キー付き・重なる面が開いているあいだは入力とブラウザと重なる面に譲る。 */
export function isComposerFocusKey(event: ComposerFocusKeyEvent, overlayOpen: boolean): boolean {
  if (
    event.key !== "/" ||
    event.isComposing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    overlayOpen
  ) {
    return false
  }
  return !(event.target instanceof Element && event.target.closest(EDITABLE) !== null)
}
