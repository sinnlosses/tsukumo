// 部屋の頭の、部屋の名前から開くセッションの一覧の取り方。

import type { Locator, Page } from "playwright-core"

/** 部屋の名前のボタン（押すとセッションの一覧が開く）。 */
export function sessionMenuOpener(page: Page): Locator {
  return page.locator('[data-region="room-head"] > button[aria-haspopup="dialog"]')
}

export function sessionMenu(page: Page): Locator {
  return page.getByRole("dialog", { name: "セッションの切り替え" })
}

/** 一覧のうち、いま開いているセッションでない行（「＋ 新しく始める」は含まない）。 */
export function otherSessionRows(menu: Locator): Locator {
  return menu.locator('button[aria-current="false"]')
}
