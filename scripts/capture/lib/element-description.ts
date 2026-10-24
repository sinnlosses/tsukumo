// 撮影の道具が `--measure` で出す、要素1つの位置と大きさの1行。

import type { Page } from "playwright-core"

/**
 * 要素1つの位置と大きさ、内容の高さ（scrollHeight）と見えている高さ（clientHeight）を1行にする。見つからないときは "無し" を返して続ける
 * （道具なので、1つ測れなくても残りを出す）。同じセレクタに複数当たったら件数も添える。
 */
export async function describeElement(page: Page, selector: string): Promise<string> {
  const locator = page.locator(selector)
  const count = await locator.count()
  if (count === 0) {
    return "無し"
  }

  const bounds = await locator.first().boundingBox()
  const box = bounds ?? undefined
  if (box === undefined) {
    return `${String(count)}件（描画されていない）`
  }

  const scroll = await locator.first().evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }))
  const rect = `top ${round(box.y)} / bottom ${round(box.y + box.height)} / left ${round(box.x)} / 幅 ${round(box.width)} / 高さ ${round(box.height)} / scrollHeight ${String(scroll.scrollHeight)} / clientHeight ${String(scroll.clientHeight)}`
  return count === 1 ? rect : `${String(count)}件、先頭: ${rect}`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
