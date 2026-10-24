// E2E がサーバとブラウザの両方に使う、凍らせた時計とタイムゾーン。

import type { Page } from "playwright-core"

import { followFakeClock } from "../../scripts/shared/capture-clock.ts"

/** サーバとブラウザの時計を凍らせる瞬間（走らせる日に依らない固定の値）。 */
export const FIXED_INSTANT = "2026-01-15T01:00:00Z"

/** 両側のタイムゾーン（サーバは子プロセスの `TZ`、ブラウザはコンテキストの `timezoneId`）。 */
export const TIME_ZONE = "Asia/Tokyo"

/**
 * ブラウザの時計を凍らせた瞬間から始める。`page.clock.install` だけでは `pauseAt` を
 * 呼ぶまで実時間で進み、止まったサーバの時計（`TSUKUMO_FIXED_CLOCK`）とずれて、
 * `SUCCESS_MOTION_WINDOW_MS` のような時間の窓の判定が実行の速さで揺れる。
 *
 * `page.clock.install` は `Date.now()` を差し替えるが `Temporal.Now` は差し替えないので、
 * `Temporal.Now.instant()` を `Date.now()` に従わせる（ブラウザで「いま」を読むのは
 * `nowEpochMilliseconds` の1つだけで、そこが呼ぶのはこれだけ）。差し込む台本は
 * 文字列で渡す——ページの中で動くコードで、このファイルの型と lint の対象にしない。
 */
export async function installFixedClock(page: Page): Promise<void> {
  const fixed = Temporal.Instant.from(FIXED_INSTANT).epochMilliseconds
  // install から pauseAt までに時計が実時間で進むので、同じ時刻で install すると
  // pauseAt(fixed) が過去を指して投げる。手前で install して fixed へ進めて止める。
  await page.clock.install({ time: fixed - 1000 })
  await page.clock.pauseAt(fixed)
  await followFakeClock(page)
}
