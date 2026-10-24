// 目次が DOM の寸法を読む場所。`getBoundingClientRect` と `getComputedStyle` の読みはここに集める。

/** 見出しの上端がこの距離まで一覧の上端に近づいたら、その見出しを読んでいることにする（px）。 */
const ACTIVE_SLACK_PX = 24

/** 札の幅がこれ（rem）を下回るあいだは、利用者が選んでいなければ列を畳んでおく。 */
const NARROW_CARD_REM = 48

/** 画面上の上端（px）。 */
export function topOf(element: Element): number {
  return element.getBoundingClientRect().top
}

/**
 * 見出しを「読んでいる」とみなす線の画面上の位置（px）。見出しの上端がこの線以上に上なら読み終えた側。
 * 基準は一覧の上端。狭い画面では列が出ず（高さ 0）一覧の上端は基準にならないので、読む面の上端を使う。
 */
export function activeLineOf(
  content: HTMLElement,
  nav: HTMLElement | null,
  scroller: Element | null,
): number {
  const headHeight = Number.parseFloat(
    getComputedStyle(content).getPropertyValue("--turn-card-head-height"),
  )
  const reference =
    nav !== null && nav.getBoundingClientRect().height > 0 ? nav : (scroller ?? content)
  return (
    reference.getBoundingClientRect().top +
    (Number.isFinite(headHeight) ? headHeight : 0) +
    ACTIVE_SLACK_PX
  )
}

/** 根の上へ広げる距離（px）。どれだけ転がり去った見出しも、根の外へ出さない。 */
const BAND_REACH_PX = 1_000_000

/**
 * `line` より上のすべてを帯にする `IntersectionObserver` の `rootMargin`。
 * 帯と交わる見出しは、上端が `line` 以上に上にある（転がる器の外へ転がり去った見出しも含む）。
 * 根は転がる器（無ければ画面）で、根の上へ大きく広げ、下端を `line` まで縮める。
 */
export function bandRootMargin(line: number, scroller: Element | null): string {
  const rootBottom =
    scroller === null
      ? document.documentElement.clientHeight
      : scroller.getBoundingClientRect().bottom
  return `${String(BAND_REACH_PX)}px 0px ${String(Math.round(line - rootBottom))}px 0px`
}

/** 札の幅が、列を畳んでおく狭さか。 */
export function isNarrowFrame(frame: Element): boolean {
  const rootFontPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return frame.getBoundingClientRect().width < NARROW_CARD_REM * rootFontPx
}

/** `row` が `nav` の中で見える位置になるよう、`nav` の `scrollTop` だけを動かす。 */
export function scrollRowIntoView(nav: HTMLElement, row: HTMLElement): void {
  const navRect = nav.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  if (rowRect.top < navRect.top) {
    nav.scrollTop -= navRect.top - rowRect.top
  } else if (rowRect.bottom > navRect.bottom) {
    nav.scrollTop += rowRect.bottom - navRect.bottom
  }
}
