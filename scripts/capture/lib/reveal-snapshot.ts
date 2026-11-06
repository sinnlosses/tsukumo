// 書き上げる演出の途中で、本文の領域の要素ごとに `data-reveal` の印と `opacity` を読み、表にする。
// 演出はまだ出していない節に `data-reveal` を付けて `style.opacity` で隠すので（`startPop`）、画に写った範囲を数値でも読めるようにする。

import type { Page } from "playwright-core"

import { MAIN_REGION_SELECTOR } from "./capture-page.ts"

/**
 * 演出の開始（`data-revealing` が最初に現れた）瞬間の `performance.now()` を `window.__revealSeenAt` に控える。
 * ページを開く前に `addInitScript` で入れる。
 */
export const REVEAL_SEEN_SCRIPT = `
  new MutationObserver(() => {
    if (window.__revealSeenAt === undefined && document.querySelector("[data-revealing]")) {
      window.__revealSeenAt = performance.now()
    }
  }).observe(document, { subtree: true, childList: true, attributes: true })
`

/** 演出の印か `opacity` を持つ要素1つ。 */
export type RevealRow = {
  /** 本文の領域の中で、該当する要素を上から数えた番号（0 始まり）。 */
  readonly index: number
  readonly tag: string
  /** class の先頭の名前（CSS Modules の `_名前_ハッシュ_番号` から名前だけにしたもの。`[class*="…"]` に書ける形）。 */
  readonly name: string
  /** `data-reveal` の値。付いていなければ空。 */
  readonly reveal: string
  /** `style.opacity`。書いていなければ空。 */
  readonly opacity: string
}

export type RevealSnapshot = {
  /** 読んだ時点の `performance.now()`。 */
  readonly nowMs: number
  /** 演出の開始を見つけた時点の `performance.now()`。見つけていなければ undefined。 */
  readonly seenAtMs?: number
  readonly rows: readonly RevealRow[]
}

/** 本文の領域の中で `data-reveal` を持つか `opacity` を書かれている要素を、上から順に読む。 */
export async function readRevealSnapshot(page: Page): Promise<RevealSnapshot> {
  return await page.evaluate((selector) => {
    const elements = [...document.querySelectorAll<HTMLElement>(`${selector} *`)].filter(
      (element) => element.hasAttribute("data-reveal") || element.style.opacity !== "",
    )
    const seenAt: unknown = Reflect.get(window, "__revealSeenAt")
    return {
      nowMs: performance.now(),
      seenAtMs: typeof seenAt === "number" ? seenAt : undefined,
      rows: elements.map((element, index) => ({
        index,
        tag: element.tagName.toLowerCase(),
        name:
          (element.getAttribute("class") ?? "")
            .split(" ")[0]
            ?.replace(/^_/, "")
            .replace(/_[^_]+_[^_]+$/, "") ?? "",
        reveal: element.getAttribute("data-reveal") ?? "",
        opacity: element.style.opacity,
      })),
    }
  }, MAIN_REGION_SELECTOR)
}

/** 指定の時刻と実測の経過、演出の印か `opacity` を持つ要素の表を、1行ずつの文字列にする。 */
export function formatRevealSnapshot(
  revealAtMs: number,
  snapshot: RevealSnapshot,
): readonly string[] {
  const elapsed =
    snapshot.seenAtMs === undefined
      ? "開始時刻は控えられていない"
      : `演出の開始から ${String(Math.round(snapshot.nowMs - snapshot.seenAtMs))}ms`
  const header = `reveal-at ${String(revealAtMs)}ms（${elapsed}）。印か opacity を持つ要素 ${String(snapshot.rows.length)}件（出し終えた要素は含まない）`
  return [header, ...snapshot.rows.map(describeRow)]
}

function describeRow(row: RevealRow): string {
  const reveal = row.reveal === "" ? "data-reveal なし" : `data-reveal ${row.reveal}`
  const opacity = row.opacity === "" ? "" : ` / opacity ${row.opacity}`
  return `  ${String(row.index)} ${row.tag} ${row.name}: ${reveal}${opacity}`
}
