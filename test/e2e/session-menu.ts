// サイドバーの頭の、部屋の名前から開くセッションの一覧の取り方。

import type { Locator, Page } from "playwright-core"

/** 部屋の名前のボタン（サイドバーの頭にあり、押すとセッションの一覧が開く）。検索の入口も同じ頭にあるので、先頭のボタンを取る。 */
export function sessionMenuOpener(page: Page): Locator {
  return page.locator('[data-region="sidebar"] button[aria-haspopup="dialog"]').first()
}

export function sessionMenu(page: Page): Locator {
  return page.getByRole("dialog", { name: "セッションの切り替え" })
}

/** 一覧のうち、いま開いているセッションでない行（「＋ 新しく始める」は含まない）。 */
export function otherSessionRows(menu: Locator): Locator {
  return menu.locator('button[aria-current="false"]')
}
