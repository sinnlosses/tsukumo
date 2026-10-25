// `--paper-metric` の出力。窓ごとに紙面の物差しを表で出す。

import process from "node:process"

import type { Page } from "playwright-core"

import { MAIN_REGION_SELECTOR, SKIP_REVEAL_KEY, settlePage } from "./capture-page.ts"
import type { WindowSize } from "./capture-size.ts"
import { formatPaperMetric, measurePaperMetric } from "./paper-metric.ts"

/** 窓ごとに演出を打ち切って落ち着かせ、紙面の物差しを表で出す。測れなければ理由を出して 1。 */
export async function printPaperMetrics(
  page: Page,
  viewports: readonly WindowSize[],
): Promise<number> {
  for (const viewport of viewports) {
    try {
      await page.setViewportSize(viewport)
      await page.keyboard.press(SKIP_REVEAL_KEY)
      await settlePage(page)
      await page
        .locator(MAIN_REGION_SELECTOR)
        .first()
        .evaluate((element) => {
          element.scrollTop = 0
        })
      const rows = formatPaperMetric(await measurePaperMetric(page))
      process.stdout.write(
        `紙面の物差し ${String(viewport.width)}x${String(viewport.height)}\n${rows.join("\n")}\n`,
      )
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }
  return 0
}
