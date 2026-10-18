// E2E が使うヘッドレス Chrome の起動と接続。

import { type Browser, type BrowserServer, chromium } from "playwright-core"

export type LaunchedChrome = {
  readonly server: BrowserServer
  /** `server` に繋いだ側。`close` は切断だけで、Chrome は止めない。 */
  readonly browser: Browser
}

export async function launchChrome(): Promise<LaunchedChrome> {
  const server = await launchChromeServer()
  try {
    const browser = await chromium.connect(server.wsEndpoint(), {
      timeout: BROWSER_STEP_TIMEOUT_MS,
    })
    return { server, browser }
  } catch (error) {
    await server.kill()
    throw error
  }
}

/**
 * ブラウザを起こして繋ぐ全体の上限（ミリ秒）。E2E の hook の上限より短くし、
 * 起こす段と繋ぐ段で半分ずつ使う。
 */
const BROWSER_LAUNCH_TIMEOUT_MS = 48_000
const BROWSER_STEP_TIMEOUT_MS = BROWSER_LAUNCH_TIMEOUT_MS / 2

async function launchChromeServer(): Promise<BrowserServer> {
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
