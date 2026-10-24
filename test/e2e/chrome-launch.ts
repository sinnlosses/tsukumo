// E2E が使うヘッドレス Chrome の起動と接続。

import { type Browser, type BrowserServer, chromium } from "playwright-core"

/**
 * ブラウザを起こして繋ぐ全体の上限（ミリ秒）。E2E の hook の上限より短くし、
 * 起こす段と繋ぐ段で半分ずつ使う。
 */
const BROWSER_LAUNCH_TIMEOUT_MS = 48_000
const BROWSER_STEP_TIMEOUT_MS = BROWSER_LAUNCH_TIMEOUT_MS / 2

/** 起こした Chrome の `wsEndpoint` を渡す先の `provide`/`inject` の名前。 */
export const CHROME_ENDPOINT_KEY = "chromeEndpoint"

/** 止めるのは呼び側が `server.kill()` する。 */
export async function launchChromeServer(): Promise<BrowserServer> {
  try {
    return await chromium.launchServer({
      headless: true,
      timeout: BROWSER_STEP_TIMEOUT_MS,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error)
    throw new Error(
      `E2E には Playwright の headless shell が要る（\`pnpm exec playwright-core install chromium-headless-shell\` を打つ）: ${String(reason)}`,
      { cause: error },
    )
  }
}

/** 起こしてある Chrome に繋ぐ。返した `Browser` の `close` は切断だけで、Chrome は止めない。 */
export function connectChrome(wsEndpoint: string): Promise<Browser> {
  return chromium.connect(wsEndpoint, { timeout: BROWSER_STEP_TIMEOUT_MS })
}
