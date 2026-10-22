// 撮影の道具が `--measure` で出す、要素1つの位置と大きさの1行。

/**
 * 要素1つの位置と大きさ、内容の高さ（scrollHeight）と見えている高さ（clientHeight）を1行にする。見つからないときは "無し" を返して続ける
 * （道具なので、1つ測れなくても残りを出す）。同じセレクタに複数当たったら件数も添える。
 */
export async function describeElement(
  page: { readonly locator: (selector: string) => Locator },
  selector: string,
): Promise<string> {
  const locator = page.locator(selector)
  const count = await locator.count()
  if (count === 0) {
    return "無し"
  }

  const box = await locator.first().boundingBox()
  if (box === null) {
    return `${String(count)}件（描画されていない）`
  }

  const scroll = await locator.first().evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }))
  const rect = `top ${round(box.y)} / bottom ${round(box.y + box.height)} / left ${round(box.x)} / 幅 ${round(box.width)} / 高さ ${round(box.height)} / scrollHeight ${String(scroll.scrollHeight)} / clientHeight ${String(scroll.clientHeight)}`
  return count === 1 ? rect : `${String(count)}件、先頭: ${rect}`
}

type ScrollExtent = { readonly scrollHeight: number; readonly clientHeight: number }

/** Playwright の `Locator` のうち、この道具が使う分だけ。 */
type Locator = {
  readonly count: () => Promise<number>
  readonly first: () => {
    readonly evaluate: (
      pageFunction: (element: HTMLElement) => ScrollExtent,
    ) => Promise<ScrollExtent>
    readonly boundingBox: () => Promise<{
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
    } | null>
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
