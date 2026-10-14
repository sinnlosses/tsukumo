// 撮影の道具が開いたページを落ち着かせ、撮る前の操作を当てる共通の手続き。

import type { Page } from "playwright-core"

import { applyPreparation, type Preparation } from "./capture-preparation.ts"

/**
 * 本文が入る領域（メインビュー）。class 名は組み立てのたびにハッシュ化される（CSS Modules）
 * ので、領域を指すときは `<Layout>` が付ける `data-region` を使う。
 */
export const MAIN_REGION_SELECTOR = '[data-region="main"]'

/** ページの中身が落ち着くまで待つ上限（ミリ秒）。SSE / WebSocket があるので networkidle は待たない。 */
const SETTLE_TIMEOUT_MS = 10_000

/** 操作を1つ当てるのに待つ上限と、当て終えてから描き直しを待つ余裕（ミリ秒）。 */
const PREPARE_TIMEOUT_MS = 2_000
const PREPARE_SETTLE_MS = 800

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
    await page.waitForTimeout(PREPARE_SETTLE_MS)
  }
  return missed
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
