// 撮る前にページへ当てる操作の型と当て方。撮影の道具が同じ語彙で操作を並べるために共有する。

import type { Page } from "playwright-core"

/**
 * 撮る前に当てる操作。ここに並べたものだけにする。
 *
 * - `scroll`: その要素が見えるところまで、それを囲む領域の内側を送る
 * - `click`: 押す（モーダルを開く口・狭い窓のタブ）
 * - `hover`: 触れる（押すと状態が進んでしまう場所）
 * - `type`: 入力欄に打つ（`/` と `@` の補完）
 * - `hash`: `location.hash` を書いて画面を移す（キャラクター画面・作る画面）
 * - `advance`: 偽の時計をミリ秒だけ進める（時間が経つと出る画）
 */
export type Preparation =
  | { readonly kind: "scroll"; readonly selector: string }
  | { readonly kind: "click"; readonly selector: string }
  | { readonly kind: "hover"; readonly selector: string }
  | { readonly kind: "type"; readonly selector: string; readonly text: string }
  | { readonly kind: "hash"; readonly hash: string }
  | { readonly kind: "advance"; readonly ms: number }

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
  }
}

/** 引数の `index` の位置の旗が操作を表すなら、その操作と、旗と値で使った個数を返す。 */
export function readPreparationFlag(
  argv: readonly string[],
  index: number,
): { readonly step: Preparation; readonly consumed: number } | undefined {
  const flag = argv[index]
  const first = argv[index + 1]
  if (first === undefined) {
    return undefined
  }
  switch (flag) {
    case "--click":
      return { step: { kind: "click", selector: first }, consumed: 2 }
    case "--hover":
      return { step: { kind: "hover", selector: first }, consumed: 2 }
    case "--hash":
      return { step: { kind: "hash", hash: first }, consumed: 2 }
    case "--advance": {
      const ms = Number(first)
      return Number.isInteger(ms) && ms > 0
        ? { step: { kind: "advance", ms }, consumed: 2 }
        : undefined
    }
    case "--type": {
      const text = argv[index + 2]
      return text === undefined
        ? undefined
        : { step: { kind: "type", selector: first, text }, consumed: 3 }
    }
    default:
      return undefined
  }
}
