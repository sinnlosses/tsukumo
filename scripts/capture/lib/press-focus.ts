// `--press` のキーが届くフォーカスの在りかを読み、メインビューにもモーダルにも無いときに知らせる。

import type { Page } from "playwright-core"

export type FocusPlace = {
  readonly description: string
  readonly inMainView: boolean
  readonly inDialog: boolean
}

/** いまのフォーカスの在りか（要素の短い名前と、メインビュー・モーダルの中か）。 */
export async function readFocusPlace(page: Pick<Page, "evaluate">): Promise<FocusPlace> {
  return page.evaluate(() => {
    const active = document.activeElement
    if (active === null) {
      return { description: "なし", inMainView: false, inDialog: false }
    }
    return {
      description: `${active.tagName.toLowerCase()}${active.className === "" ? "" : `.${String(active.className).slice(0, 24)}`}`,
      inMainView: active.closest("[data-main-view]") !== null,
      inDialog: active.closest('[role="dialog"]') !== null,
    }
  })
}

/**
 * `--press` のキーが、メインビューにもモーダルにも無いフォーカスへ届くときの知らせの行。
 * 届き先がメインビューかモーダルなら空文字。
 */
export function pressFocusNotice(place: FocusPlace): string {
  if (place.inMainView || place.inDialog) {
    return ""
  }
  return `フォーカスがメインビューに無い（${place.description}）: メインビューで効くキー（PageDown など）は、先に --click で中を押してから --press を書く`
}
