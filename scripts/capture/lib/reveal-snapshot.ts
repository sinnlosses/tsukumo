// 書き上げる演出の途中で、本文の領域の要素ごとに `clip-path` と `opacity` がどこまで進んでいるかを読み、表にする。
// 演出は `style.clipPath`（文字）と `style.opacity`（図）に書いて進めるので（`applyStep`）、
// 画に写った範囲を数値でも読めるようにする。

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

/** 演出が書いている要素1つ。 */
export type RevealRow = {
  /** 本文の領域の中で、書いている要素を上から数えた番号（0 始まり）。 */
  readonly index: number
  readonly tag: string
  /** class の先頭の名前（CSS Modules の `_名前_ハッシュ_番号` から名前だけにしたもの。`[class*="…"]` に書ける形）。 */
  readonly name: string
  /** `style.clipPath`。書いていなければ空。 */
  readonly clipPath: string
  /** `style.opacity`。書いていなければ空。 */
  readonly opacity: string
}

export type RevealSnapshot = {
  /** 読んだ時点の `performance.now()`。 */
  readonly nowMs: number
  /** 演出の開始を見つけた時点の `performance.now()`。見つけていなければ undefined。 */
  readonly seenAtMs: number | undefined
  readonly rows: readonly RevealRow[]
}

/** 本文の領域の中で `clip-path` か `opacity` を書かれている要素を、上から順に読む。 */
export async function readRevealSnapshot(page: Page): Promise<RevealSnapshot> {
  return await page.evaluate((selector) => {
    const elements = [...document.querySelectorAll<HTMLElement>(`${selector} *`)].filter(
      (element) => element.style.clipPath !== "" || element.style.opacity !== "",
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
        clipPath: element.style.clipPath,
        opacity: element.style.opacity,
      })),
    }
  }, MAIN_REGION_SELECTOR)
}

/** 畳まれている `clip-path`（高さ 0。ブラウザが書き直した形も拾う）。 */
const HIDDEN_CLIP_PATTERN = /^inset\(0(px)? 0(px)? 100%/

/** 指定の時刻と実測の経過、書いている要素の表を、1行ずつの文字列にする。 */
export function formatRevealSnapshot(
  revealAtMs: number,
  snapshot: RevealSnapshot,
): readonly string[] {
  const elapsed =
    snapshot.seenAtMs === undefined
      ? "開始時刻は控えられていない"
      : `演出の開始から ${String(Math.round(snapshot.nowMs - snapshot.seenAtMs))}ms`
  const header = `reveal-at ${String(revealAtMs)}ms（${elapsed}）。書いている要素 ${String(snapshot.rows.length)}件（書き終えた要素は含まない）`
  return [header, ...snapshot.rows.map(describeRow)]
}

function describeRow(row: RevealRow): string {
  const clip = describeClip(row.clipPath)
  const opacity = row.opacity === "" ? "" : ` / opacity ${row.opacity}`
  return `  ${String(row.index)} ${row.tag} ${row.name}: ${clip}${opacity}`
}

function describeClip(clipPath: string): string {
  if (clipPath === "") {
    return "clip-path なし"
  }
  return HIDDEN_CLIP_PATTERN.test(clipPath) ? "隠れている" : clipPath
}
