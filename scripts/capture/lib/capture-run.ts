// 撮影の道具の撮影本体。ブラウザを起こし、ページを落ち着かせ、操作を当てて撮り、測りを出す。

import process from "node:process"

import { chromium, type Page } from "playwright-core"

import { followFakeClock } from "../../shared/capture-clock.ts"
import type { CaptureOptions } from "./capture-option.ts"
import {
  applyPreparations,
  openPage,
  revealPageAt,
  scrollIntoView,
  scrollMatchNotice,
  SKIP_REVEAL_KEY,
  settlePage,
} from "./capture-page.ts"
import { describePreparation } from "./capture-preparation.ts"
import { applyHolds, stubRpc } from "./capture-route.ts"
import type { Source } from "./capture-source.ts"
import { describeElement } from "./element-description.ts"
import { printPaperMetrics } from "./paper-metric-print.ts"
import { formatRevealSnapshot, readRevealSnapshot, REVEAL_SEEN_SCRIPT } from "./reveal-snapshot.ts"
import {
  type SceneEventWatch,
  sceneEndTarget,
  sceneEventTimeoutMs,
  watchSceneEvents,
} from "./scene-end.ts"
import { readSceneSession } from "./scene-session.ts"
import { describeTextLength } from "./text-length.ts"

/** `--wait-for` が要素の出現と、演出の終わりをそれぞれ待つ上限（ミリ秒）。 */
const WAIT_FOR_TIMEOUT_MS = 15_000

/** 演出の終わりを待つあいだ、ブラウザの時計を1回に進める量（ミリ秒）。 */
const REVEAL_ADVANCE_MS = 1_000

/** 時計を進めるたびに実時間で空ける間隔（ミリ秒）。待った実時間の数え上げにも使う。 */
const REVEAL_POLL_MS = 50

/** `--scroll-to` で転がしたあと、偽の時計を進める量（ミリ秒）。転がしを受けた再描画を反映させる。 */
const SCROLL_ADVANCE_MS = 500

/** 書き上げていくように見せる演出が進行中の印（`useReportReveal` の `data-revealing`）。 */
const REVEALING_SELECTOR = "[data-revealing]"

export async function capture(
  url: string,
  skipReveal: boolean,
  options: CaptureOptions,
): Promise<number> {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
    })
    const clockInstalled =
      options.waitFor !== undefined ||
      options.clock !== undefined ||
      options.revealAt !== undefined ||
      options.preparations.some((step) => step.kind === "advance")
    if (clockInstalled) {
      await (options.clock === undefined
        ? page.clock.install()
        : page.clock.install({ time: options.clock }))
      await followFakeClock(page)
    }
    if (options.revealAt !== undefined) {
      await page.addInitScript(REVEAL_SEEN_SCRIPT)
    }
    for (const stub of options.stubs) {
      await stubRpc(page, stub)
    }
    await applyHolds(page, options.heldProcedures, options.holdStream)
    // 接続は遷移の途中で開くので、フレームを数え始めるのは遷移より前。
    const watch = watchSceneEvents(page)
    await openPage(page, url)

    const sceneFailure = await waitForSceneEnd(watch, options.source)
    if (sceneFailure !== undefined) {
      process.stderr.write(`${sceneFailure}\n`)
      return 1
    }
    if (skipReveal && options.revealAt === undefined) {
      await page.keyboard.press(SKIP_REVEAL_KEY)
    }
    const settleFailure = await (
      options.revealAt === undefined ? settlePage(page) : revealPageAt(page, options.revealAt)
    ).then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )
    if (settleFailure !== undefined) {
      process.stderr.write(`${settleFailure}\n`)
      return 1
    }

    if (options.waitFor !== undefined && !(await waitForRevealSettled(page, options.waitFor))) {
      process.stderr.write(`現れなかった: ${options.waitFor}（${String(WAIT_FOR_TIMEOUT_MS)}ms）\n`)
      return 1
    }

    const [missed] = await applyPreparations(page, options.preparations, "stop", (line) => {
      process.stdout.write(`${line}\n`)
    })
    if (missed !== undefined) {
      process.stderr.write(`当てられなかった: ${describePreparation(missed)}\n`)
      return 1
    }

    if (options.scrollTo !== undefined) {
      const matched = await scrollIntoView(page, options.scrollTo)
      if (matched === 0) {
        process.stderr.write(`現れなかった: ${options.scrollTo}\n`)
        return 1
      }
      const notice = scrollMatchNotice(options.scrollTo, matched)
      if (notice !== "") {
        process.stdout.write(`${notice}\n`)
      }
      if (clockInstalled && options.revealAt === undefined) {
        await page.clock.runFor(SCROLL_ADVANCE_MS)
      }
      if (options.revealAt === undefined) {
        const scrollSettleFailure = await settlePage(page).then(
          () => undefined,
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        )
        if (scrollSettleFailure !== undefined) {
          process.stderr.write(`${scrollSettleFailure}\n`)
          return 1
        }
      }
    }

    await page.screenshot({ path: options.out, fullPage: options.fullPage })
    process.stdout.write(
      `撮った: ${options.out}（${String(options.width)}x${String(options.height)}）\n`,
    )

    if (options.revealAt !== undefined) {
      const snapshot = await readRevealSnapshot(page)
      for (const line of formatRevealSnapshot(options.revealAt, snapshot)) {
        process.stdout.write(`${line}\n`)
      }
    }

    for (const selector of options.measures) {
      process.stdout.write(`${selector}: ${await describeElement(page, selector)}\n`)
    }

    for (const selector of options.textLengths) {
      process.stdout.write(`${await describeTextLength(page, selector)}\n`)
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    process.stdout.write(`横のはみ出し: ${String(overflow)}px\n`)

    if (options.paperMetric) {
      return await printPaperMetrics(page, options.viewports)
    }
    return 0
  } finally {
    await browser.close()
  }
}

/**
 * `--scene` で起こした場面の最後の手（`--until-step` があればその手）が画面へ届くまで待つ。
 * URL を渡された撮影は疑似セッションではないので待たない。待てなければ理由を返す。
 */
async function waitForSceneEnd(
  watch: SceneEventWatch,
  source: Source,
): Promise<string | undefined> {
  if (source.kind !== "scene") {
    return undefined
  }
  const reading = readSceneSession(source.session)
  if (reading.kind === "unreadable") {
    return reading.message
  }
  const target = sceneEndTarget(reading.session, source.scene, source.until)
  const timeoutMs =
    target === undefined
      ? undefined
      : sceneEventTimeoutMs(reading.session, source.scene, source.until, target)
  if (target === undefined || timeoutMs === undefined) {
    return `場面に待てる手が無い: ${source.scene}`
  }
  try {
    await watch.waitFor(target, { scene: source.scene, timeoutMs })
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

async function waitForRevealSettled(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: WAIT_FOR_TIMEOUT_MS })
    for (let waited = 0; waited < WAIT_FOR_TIMEOUT_MS; waited += REVEAL_POLL_MS) {
      if ((await page.$(REVEALING_SELECTOR)) === null) {
        return true
      }
      await page.clock.runFor(REVEAL_ADVANCE_MS)
      await page.waitForTimeout(REVEAL_POLL_MS)
    }
    return false
  } catch {
    return false
  }
}
