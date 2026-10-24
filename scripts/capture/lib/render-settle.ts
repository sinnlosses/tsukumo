// 撮る前に、ページの描き直し（フォント・画像・終わりのある動き）が終わるのを待つ。

import type { Page } from "playwright-core"

/** 描き直しが終わるのを待つ上限（ミリ秒）。超えたら撮らずに落とす。 */
const RENDER_SETTLE_TIMEOUT_MS = 5_000

/**
 * ページの描き直しが終わるのを待つ。フォントと画像の読み込み・終わりのある動き
 * （CSS の transition など）の完了のあと、描画を2フレーム進める。終わりのない動き（回る輪）と、
 * 時計でない時間軸（スクロール連動）の動きは待たない（後者は転がしても終わらない）。
 * `page.clock.install()` を入れて `runFor` で進めるページでも `requestAnimationFrame` は進む
 * （`pauseAt` で止めたページは進まないので、この道具は `pauseAt` を使わない）。
 * 上限まで終わらなければ throw する（撮らずに落とす）。
 */
export async function settleRender(page: Pick<Page, "evaluate">): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`描き直しが終わらなかった（${String(RENDER_SETTLE_TIMEOUT_MS)}ms）`))
    }, RENDER_SETTLE_TIMEOUT_MS)
  })
  try {
    await Promise.race([
      page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => null)))
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.timeline instanceof DocumentTimeline &&
                animation.effect?.getComputedTiming().endTime !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => null)),
        )
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve()
            })
          })
        })
      }),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}
