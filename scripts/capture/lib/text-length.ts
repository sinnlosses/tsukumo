// 撮影の道具が `--text-length` で出す、要素1つの見えている文字数の1行。

import type { Page } from "playwright-core"

/** 先頭に当たった要素の `innerText` の文字数を1行にする。当たらなければ "無し" を返して続ける。 */
export async function describeTextLength(page: Page, selector: string): Promise<string> {
  const locator = page.locator(selector)
  if ((await locator.count()) === 0) {
    return `字数 ${selector}: 無し`
  }
  const length = await locator.first().evaluate((element) => {
    const text = element instanceof HTMLElement ? element.innerText : (element.textContent ?? "")
    return Array.from(text).length
  })
  return `字数 ${selector}: ${String(length)}`
}
