// 撮影の道具が開いたページを落ち着かせ、撮る前の操作を当てる共通の手続き。

import type { Page } from "playwright-core"

import { applyPreparation, type Preparation } from "./capture-preparation.ts"

/**
 * 本文が入る領域（メインビュー）。class 名は組み立てのたびにハッシュ化される（CSS Modules）
 * ので、領域を指すときは `<Layout>` が付ける `data-region` を使う。
 */
export const MAIN_REGION_SELECTOR = '[data-region="main"]'

/**
 * 演出を打ち切るキー（`entry.skipReveal`。`SKIP_EVENT_NAMES` は
 * `keydown` ならどのキーでも拾うので、押すキーの意味は問わない）。フォーカスがどこにあっても
 * `window` の listener が capture 段階で拾うので、打つ前にどこかへフォーカスを当てる必要も無い。
 */
export const SKIP_REVEAL_KEY = "Escape"

/** ページの中身が落ち着くまで待つ上限（ミリ秒）。SSE / WebSocket があるので networkidle は待たない。 */
const SETTLE_TIMEOUT_MS = 10_000

/** 操作を1つ当てるのに待つ上限（ミリ秒）。 */
const PREPARE_TIMEOUT_MS = 2_000

/** 描き直しが終わるのを待つ上限（ミリ秒）。超えたら撮らずに落とす。 */
const RENDER_SETTLE_TIMEOUT_MS = 5_000

/** URL を開き、本文が入る領域が現れるまで待つ。現れなくても進む。 */
export async function openPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page
    .waitForSelector(MAIN_REGION_SELECTOR, { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => undefined)
}

/**
 * 操作を順に当て、当てられなかった手を返す。`stop` は最初の外れで打ち切り、`continue` は
 * 残りも試す。1つでも試したら描き直しを待つ。
 */
export async function applyPreparations(
  page: Page,
  steps: readonly Preparation[],
  onMiss: "stop" | "continue",
): Promise<readonly Preparation[]> {
  const missed = await collectMisses(
    steps,
    (step) => applyPreparation(page, step, PREPARE_TIMEOUT_MS),
    onMiss,
  )
  if (steps.length > 0) {
    await settlePage(page)
  }
  return missed
}

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

/**
 * 撮る前にページを落ち着かせる。描き直し（{@link settleRender}）のあと、本文の領域が静止するまで待つ
 * （チャートの伸びや自動スクロールのような、アニメーション API に載らない動きの終わりを見る）。
 */
export async function settlePage(page: Page): Promise<void> {
  await settleRender(page)
  await settleStill(page)
}

/**
 * `sample` を `intervalMs` おきに最大 `attempts` 回呼び、連続2回の結果が一致したら true、
 * 一致しないまま回数が尽きたら false を返す。
 */
export async function waitUntilStable(
  sample: () => Promise<Buffer>,
  options: { readonly intervalMs: number; readonly attempts: number },
): Promise<boolean> {
  let previous: Buffer | undefined
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    const current = await sample()
    if (previous?.equals(current) === true) {
      return true
    }
    previous = current
    await new Promise<void>((resolve) => {
      setTimeout(resolve, options.intervalMs)
    })
  }
  return false
}

/** `apply` が false を返した手を集める。`stop` は最初の外れで打ち切る。 */
export async function collectMisses(
  steps: readonly Preparation[],
  apply: (step: Preparation) => Promise<boolean>,
  onMiss: "stop" | "continue",
): Promise<readonly Preparation[]> {
  const missed: Preparation[] = []
  for (const step of steps) {
    if (!(await apply(step))) {
      missed.push(step)
      if (onMiss === "stop") {
        break
      }
    }
  }
  return missed
}

/** 本文の領域を撮って比べる間隔と、撮る回数の上限（間隔 × 回数 ≒ 5秒）。 */
const STILL_INTERVAL_MS = 120
const STILL_ATTEMPTS = 42

/** 本文の領域の縁から内側へ、比べる範囲を縮める幅（px）。縁の1行で揺れる描画（領域の外の部品との重なり）を見ない。 */
const STILL_INSET_PX = 4

/**
 * 本文の領域の見た目が、連続2回の撮影で一致するまで待つ。立ち絵は領域の外なので見ない。
 * 比べる撮影は `animations: "disabled"` で撮り、終わりのない動き（回る輪）を初期の姿に止める
 * （動き続けるものは静止しないので、その動きだけを比べから外す。ほかの変化は見る）。
 * 上限まで静止しなければ throw する（撮らずに落とす）。
 */
async function settleStill(page: Pick<Page, "locator" | "screenshot">): Promise<void> {
  const main = page.locator(MAIN_REGION_SELECTOR).first()
  if ((await main.count()) === 0) {
    return
  }
  const region = await main.evaluate((element, inset: number) => {
    const rect = element.getBoundingClientRect()
    return {
      x: rect.x + window.scrollX + inset,
      y: rect.y + window.scrollY + inset,
      width: rect.width - 2 * inset,
      height: rect.height - 2 * inset,
    }
  }, STILL_INSET_PX)
  if (region.width <= 0 || region.height <= 0) {
    return
  }
  const clip = { x: region.x, y: region.y, width: region.width, height: region.height }
  const still = await waitUntilStable(
    () => page.screenshot({ clip, fullPage: true, animations: "disabled" }),
    { intervalMs: STILL_INTERVAL_MS, attempts: STILL_ATTEMPTS },
  )
  if (!still) {
    throw new Error(`静止しなかった: 本文の領域（${String(STILL_ATTEMPTS)}回撮った）`)
  }
}
