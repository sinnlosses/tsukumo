// E2E の待ちの部品。ページの描画のフレームや、凍らせた時計の進め方をここに置く。

import type { Locator, Page } from "playwright-core"

import { EVENT_TIMEOUT_MS } from "./message-record.ts"

/** `revealAfterResponse`・`revealUsageAfterTurn` が、要素が見えるまで凍らせた時計を進める1回の幅（ミリ秒）。 */
const REVEAL_CLOCK_STEP_MS = 50

/** `revealAfterResponse` が応答の件数を数え始める基準。 */
export type ResponseBaseline =
  | { readonly kind: "after-act"; readonly act: () => Promise<void> }
  | { readonly kind: "all" }

/** 基準から、「これより後に届いた応答」を数え始める件数を決める。`after-act` は操作を実行してから返す。 */
export async function countedBefore(
  baseline: ResponseBaseline,
  currentCount: () => number,
): Promise<number> {
  switch (baseline.kind) {
    case "after-act": {
      const count = currentCount()
      await baseline.act()
      return count
    }
    case "all":
      return 0
  }
}

/** ページの描画のフレームを1つ待つ（止めた時計の上でも、rAF は本物のフレームで呼ばれる〔`followFakeClock`〕）。 */
export async function nextAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve()
        })
      }),
  )
}

/** 要素が見えるまで、凍らせた時計を進める。上限は要素を待つ時間で決め、進める回数では決めない。 */
export async function advanceClockUntilVisible(page: Page, target: Locator): Promise<void> {
  const reached = target.first().waitFor({ state: "visible", timeout: EVENT_TIMEOUT_MS })
  const progress = { settled: false }
  const settle = (): void => {
    progress.settled = true
  }
  await Promise.all([
    reached,
    (async () => {
      await reached.then(settle, settle)
    })(),
    (async () => {
      while (!progress.settled) {
        await page.clock.runFor(REVEAL_CLOCK_STEP_MS)
      }
    })(),
  ])
}
