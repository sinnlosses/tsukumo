// 撮る前にページへ当てる操作の型と当て方。撮影の道具が同じ語彙で操作を並べるために共有する。

import type { Page } from "playwright-core"

import { positiveIntegerArgument } from "../../shared/positive-integer-argument.ts"

/**
 * 撮る前に当てる操作。ここに並べたものだけにする。
 *
 * - `scroll`: その要素が見えるところまで、それを囲む領域の内側を送る
 * - `click`: 押す（モーダルを開く口・狭い窓のタブ）
 * - `hover`: 触れる（押すと状態が進んでしまう場所）
 * - `type`: 入力欄に打つ（`/` と `@` の補完）
 * - `hash`: `location.hash` を書いて画面を移す（キャラクター画面・作る画面）
 * - `advance`: 偽の時計をミリ秒だけ進める（時間が経つと出る画）
 * - `wait`: 要素が出るのを待つ（`hash` で開いた画面の読み込みなど）
 */
export type Preparation =
  | { readonly kind: "scroll"; readonly selector: string }
  | { readonly kind: "click"; readonly selector: string }
  | { readonly kind: "hover"; readonly selector: string }
  | { readonly kind: "type"; readonly selector: string; readonly text: string }
  | { readonly kind: "hash"; readonly hash: string }
  | { readonly kind: "advance"; readonly ms: number }
  | { readonly kind: "wait"; readonly selector: string }

/** `wait` が要素の出現を待つ上限（ミリ秒）。`bd` の読みなど、ほかの手より遅いものを待つ。 */
const WAIT_TIMEOUT_MS = 40_000

/** 操作を1つ当てる。当たったら true、要素が見つからないなどで当たらなければ false。 */
export async function applyPreparation(
  page: Page,
  step: Preparation,
  timeoutMs: number,
): Promise<boolean> {
  try {
    switch (step.kind) {
      case "scroll":
        await page.locator(step.selector).first().scrollIntoViewIfNeeded({ timeout: timeoutMs })
        break
      case "click":
        await page.locator(step.selector).first().click({ timeout: timeoutMs })
        break
      case "hover":
        await page.locator(step.selector).first().hover({ timeout: timeoutMs })
        break
      case "type":
        await page
          .locator(step.selector)
          .first()
          .pressSequentially(step.text, { timeout: timeoutMs })
        break
      case "advance":
        await page.clock.runFor(step.ms)
        break
      case "wait":
        await page.waitForSelector(step.selector, { timeout: WAIT_TIMEOUT_MS })
        break
      case "hash":
        await page.evaluate((hash: string) => {
          window.location.hash = hash
        }, step.hash)
        break
    }
    return true
  } catch {
    return false
  }
}

/** 当てられなかった手を1行で言う（何が出ていない画像なのかを読み手が分かるように）。 */
export function describePreparation(step: Preparation): string {
  switch (step.kind) {
    case "scroll":
      return `${step.selector} が見えるまで送る`
    case "click":
      return `${step.selector} を押す`
    case "hover":
      return `${step.selector} に触れる`
    case "type":
      return `${step.selector} に ${step.text} と打つ`
    case "hash":
      return `location.hash に ${step.hash} を書く`
    case "advance":
      return `時計を ${String(step.ms)}ms 進める`
    case "wait":
      return `${step.selector} が出るのを待つ`
  }
}

export function describeCatalogMiss(
  entryName: string,
  sizeName: string,
  step: Preparation,
): string {
  return `当てられなかった: ${entryName}（${sizeName}）: ${describePreparation(step)}`
}

/** 準備を表す旗。`parseArgs` の `options` に混ぜて使う。 */
export const PREPARATION_OPTIONS = {
  click: { type: "string" },
  hover: { type: "string" },
  "wait-after": { type: "string" },
  hash: { type: "string" },
  advance: { type: "string" },
  type: { type: "string" },
} as const

/** `parseArgs` の `tokens` のうち、準備の読みが見る形。 */
export type ArgumentToken =
  | { readonly kind: "option"; readonly name: string; readonly value: string | undefined }
  | { readonly kind: "positional"; readonly value: string }
  | { readonly kind: "option-terminator" }

/**
 * 準備の旗を、現れた順に操作へ読む。`--type <selector> <text>` は、`--type` の直後の
 * 位置引数を2つ目の値として使い、その token の位置を `textTokenIndexes` に返す。
 * 2つ目の値が無い・`--advance` が正の整数でないときは undefined。
 */
export function readPreparations(tokens: readonly ArgumentToken[]):
  | {
      readonly preparations: readonly Preparation[]
      readonly textTokenIndexes: ReadonlySet<number>
    }
  | undefined {
  const preparations: Preparation[] = []
  const textTokenIndexes = new Set<number>()
  for (const [index, token] of tokens.entries()) {
    if (token.kind !== "option" || token.value === undefined) {
      continue
    }
    const value = token.value
    switch (token.name) {
      case "click":
        preparations.push({ kind: "click", selector: value })
        break
      case "hover":
        preparations.push({ kind: "hover", selector: value })
        break
      case "wait-after":
        preparations.push({ kind: "wait", selector: value })
        break
      case "hash":
        preparations.push({ kind: "hash", hash: value })
        break
      case "advance": {
        const ms = positiveIntegerArgument.safeParse(value)
        if (!ms.success) {
          return undefined
        }
        preparations.push({ kind: "advance", ms: ms.data })
        break
      }
      case "type": {
        const text = tokens[index + 1]
        if (text?.kind !== "positional") {
          return undefined
        }
        textTokenIndexes.add(index + 1)
        preparations.push({ kind: "type", selector: value, text: text.value })
        break
      }
    }
  }
  return { preparations, textTokenIndexes }
}
