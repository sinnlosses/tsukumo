// 偽の時計（`page.clock.install`）を入れたページを、その時計に従わせる初期化台本。

import type { Page } from "playwright-core"

/**
 * `page.clock.install` のあとに呼び、偽の時計の上でも画面が進むようにする。
 * `Temporal.Now` を `Date.now()` に従わせ（偽の時計は `Temporal.Now` を差し替えない）、
 * `requestAnimationFrame` を本物の描画のフレームでも呼ぶ（{@link ANIMATION_FRAME_FOLLOWS_REAL_FRAMES_SCRIPT}）。
 * rAF の台本は、同じコンテキストで後から開くタブにも効くようコンテキストに入れる（偽の時計もコンテキストに入る）。
 */
export async function followFakeClock(page: Page): Promise<void> {
  await page.addInitScript(TEMPORAL_FOLLOWS_DATE_SCRIPT)
  await page.context().addInitScript(ANIMATION_FRAME_FOLLOWS_REAL_FRAMES_SCRIPT)
}

/** `--clock` の値（オフセット付きの ISO 時刻）をエポックミリ秒に読む。読めなければ undefined。 */
export function readClockInstant(value: string): number | undefined {
  try {
    return Temporal.Instant.from(value).epochMilliseconds
  } catch {
    return undefined
  }
}

const TEMPORAL_FOLLOWS_DATE_SCRIPT =
  "Temporal.Now.instant = () => Temporal.Instant.fromEpochMilliseconds(Date.now())"

/**
 * 偽の時計は rAF も差し替えるので、`pauseAt` で止めたページでは rAF が呼ばれず、rAF で束ねて渡す届いたフレームが画面に出ない。
 * 呼ぶのは偽の rAF と本物の rAF の早いほうの1回で、時刻（`performance.now()`・`Date`）は偽の時計のまま進めない。
 * 偽の時計が残す本物の関数（`__pwClock.builtins`）を使うので、`page.clock.install` のあとに入れる。
 */
const ANIMATION_FRAME_FOLLOWS_REAL_FRAMES_SCRIPT = `(() => {
  const builtins = globalThis.__pwClock?.builtins
  if (builtins === undefined) {
    return
  }
  const fakeRequest = window.requestAnimationFrame.bind(window)
  const fakeCancel = window.cancelAnimationFrame.bind(window)
  // 偽の rAF の番号 → 同じ呼び出しを予約した本物の rAF の番号
  const realIds = new Map()
  const cancel = (id) => {
    fakeCancel(id)
    const realId = realIds.get(id)
    if (realId !== undefined) {
      realIds.delete(id)
      builtins.cancelAnimationFrame(realId)
    }
  }
  window.requestAnimationFrame = (callback) => {
    const run = () => {
      if (!realIds.has(id)) {
        return
      }
      cancel(id)
      callback(performance.now())
    }
    const id = fakeRequest(run)
    realIds.set(id, builtins.requestAnimationFrame(run))
    return id
  }
  window.cancelAnimationFrame = cancel
})()`
