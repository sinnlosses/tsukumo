// 変更前後のビューを最狭の窓で同じ操作で開き、行数が増えた要素と新しく省略された要素を出す。
// 直書きの値をトークンに丸めたときの、狭い窓の折れを目視の前に拾うための道具。
//
// 使い方（オプションの一覧は引数なしで打つと出る）:
//   node scripts/capture/compare-wrap.ts --before <URL> --after <URL> [--size 360x900]

import process from "node:process"

import { type Browser, chromium, type Page } from "playwright-core"

import { followFakeClock } from "../shared/capture-clock.ts"
import { applyPreparations, openPage, settlePage } from "./lib/capture-page.ts"
import { describePreparation, type Preparation } from "./lib/capture-preparation.ts"
import type { WindowSize } from "./lib/capture-size.ts"
import { diffWrapRows, formatWrapDiff, measureWrapRows, type WrapRow } from "./lib/wrap-metric.ts"
import { parseWrapOptions, WRAP_USAGE } from "./lib/wrap-option.ts"

type Measurement =
  | { readonly kind: "measured"; readonly rows: readonly WrapRow[] }
  | { readonly kind: "missed"; readonly step: Preparation }

async function main(argv: readonly string[]): Promise<number> {
  const options = parseWrapOptions(argv)
  if (options === undefined) {
    process.stderr.write(WRAP_USAGE)
    return 2
  }
  const browser = await chromium.launch({ headless: true })
  try {
    for (const size of options.sizes) {
      const before = await measure(browser, options.before, size, options.preparations)
      const after = await measure(browser, options.after, size, options.preparations)
      for (const measurement of [before, after]) {
        if (measurement.kind === "missed") {
          process.stderr.write(`当てられなかった: ${describePreparation(measurement.step)}\n`)
          return 1
        }
      }
      if (before.kind === "measured" && after.kind === "measured") {
        process.stdout.write(
          formatWrapDiff(
            `${String(size.width)}x${String(size.height)}`,
            diffWrapRows(before.rows, after.rows),
          ),
        )
      }
    }
    return 0
  } finally {
    await browser.close()
  }
}

async function measure(
  browser: Browser,
  url: string,
  size: WindowSize,
  preparations: readonly Preparation[],
): Promise<Measurement> {
  const page: Page = await browser.newPage({ viewport: size })
  try {
    if (preparations.some((step) => step.kind === "advance")) {
      await page.clock.install()
      await followFakeClock(page)
    }
    await openPage(page, url)
    await settlePage(page)
    const [missed] = await applyPreparations(page, preparations, "stop")
    if (missed !== undefined) {
      return { kind: "missed", step: missed }
    }
    return { kind: "measured", rows: await page.evaluate(measureWrapRows) }
  } finally {
    await page.close()
  }
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
