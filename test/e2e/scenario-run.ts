// E2E の足場の入口。後始末の登録と `open` をここに置き、部屋を起こして開き、成果物を書いて比べる
// 部分は `openRoom` にある。シナリオ（`test/e2e/<シナリオ>.test.ts`）はここを呼ぶだけにする。形の正典は
// `docs/architecture/testing.md`「E2E の走らせ方」「E2E の成果物と再現」。
//
// - ブラウザは E2E 全体で1つ（`globalSetup` が起こす）。各ファイルは `beforeAll` で繋ぎ、`afterAll` で切る。
//   tsukumo とブラウザのコンテキストは1件ごとに1つ
// - 起こした tsukumo は `afterEach` で自分の pid だけに `SIGTERM` を送り、終わるのを待ってから
//   一時のディレクトリを消す
// - 判定は DOM の構造とメッセージの列の2つの JSON だけ。スクリーンショットは目視の添え物で、
//   食い違った回と `E2E_UPDATE=1` のときだけ撮る
// - `open` は疑似セッションの予定の最初の静かな区切りまでが届いてから部屋を渡す

import type { Browser } from "playwright-core"
import { afterAll, afterEach, beforeAll, inject } from "vitest"

import { CHROME_ENDPOINT_KEY, connectChrome } from "./chrome-launch.ts"
import { openRoom, type ScenarioOptions, type ScenarioRoom } from "./scenario-open.ts"

export { VIEWPORTS } from "./scenario-viewport.ts"
export type { ScenarioOptions, ScenarioRoom } from "./scenario-open.ts"
export type { ResponseBaseline } from "./scenario-wait.ts"

export type ScenarioRun = {
  readonly open: (options: ScenarioOptions) => Promise<ScenarioRoom>
}

/**
 * シナリオのファイルの先頭で1回呼ぶ。ブラウザを起こす・閉じる、1件ごとの後始末を登録する。
 */
export function useScenarioRun(): ScenarioRun {
  let connecting: Promise<Browser> | undefined = undefined
  const cleanups: (() => Promise<void>)[] = []

  beforeAll(async () => {
    connecting = connectChrome(inject(CHROME_ENDPOINT_KEY))
    await connecting
  })

  afterEach(async () => {
    // 後から起こしたものから閉じる（コンテキスト → tsukumo → 一時のディレクトリ）。
    for (const cleanup of cleanups.splice(0).toReversed()) {
      await cleanup()
    }
  })

  afterAll(async () => {
    // 切断だけ。Chrome は `globalSetup` が止める。
    const browser = await connecting?.catch(() => undefined)
    await browser?.close()
  })

  return {
    open: async (options) => {
      if (connecting === undefined) {
        throw new Error("ブラウザに繋いでいない（beforeAll が走っていない）")
      }
      return openRoom(await connecting, options, (cleanup) => cleanups.push(cleanup))
    },
  }
}
