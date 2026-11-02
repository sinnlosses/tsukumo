// 撮影の道具が `--measure` で出す、セレクタに当たった要素の位置と大きさの行。

import type { Page } from "playwright-core"

import { type ElementMeasure, formatElementLines } from "./element-row-format.ts"

/**
 * 当たった要素ごとの位置と大きさ、内容の高さ（scrollHeight）と見えている高さ（clientHeight）を行にする。見つからないときは "無し" を返して続ける
 * （道具なので、1つ測れなくても残りを出す）。同じセレクタに複数当たったら件数の行に続けて全件を1件1行で返す。
 */
export async function describeElement(page: Page, selector: string): Promise<readonly string[]> {
  const locators = await page.locator(selector).all()
  const measures = await Promise.all(
    locators.map(async (locator): Promise<ElementMeasure> => {
      const box = await locator.boundingBox()
      if (box === null) {
        return { kind: "hidden" }
      }
      const scroll = await locator.evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }))
      return {
        kind: "rendered",
        top: box.y,
        bottom: box.y + box.height,
        left: box.x,
        width: box.width,
        height: box.height,
        ...scroll,
      }
    }),
  )
  return formatElementLines(measures)
}
