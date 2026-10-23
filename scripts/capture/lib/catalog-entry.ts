// 状態のカタログが撮る場面の定義の組み立て。場面は概念ごとのファイルに置く。
// 足すときは疑似セッションに場面を足して、その名前と、撮る前に当てる操作を、合う概念のファイルへ書く。

import { HOME_ENTRIES } from "./catalog-home.ts"
import { NOTATION_ENTRIES } from "./catalog-notation.ts"
import { QUESTION_ENTRIES } from "./catalog-question.ts"
import { REPORT_ENTRIES } from "./catalog-report.ts"
import { SCREEN_ENTRIES } from "./catalog-screen.ts"
import type { CatalogEntry } from "./catalog-type.ts"
import { WORK_PLAN_ENTRIES } from "./catalog-work-plan.ts"

export type { CatalogEntry, HomeSetup, Settle } from "./catalog-type.ts"

/**
 * 並べて見たい状態。網羅はしない — 直したときに崩れやすい場所（答え待ちの箱・ツールの進行・
 * レポートの記法・補完の候補・キャラクター画面）だけを選ぶ。撮る順は、ここに並べた概念の順。
 */
export const CATALOG: readonly CatalogEntry[] = [
  ...QUESTION_ENTRIES,
  ...REPORT_ENTRIES,
  ...NOTATION_ENTRIES,
  ...SCREEN_ENTRIES,
  ...WORK_PLAN_ENTRIES,
  ...HOME_ENTRIES,
]

/**
 * 撮る窓の大きさ。広いほうは1枚だけ撮る道具の既定と同じで、狭いほうは切り替えの規則
 * （各機能の `*.module.css` の `max-width: 760px`）の内側に入る幅にしてある。
 *
 * 狭いほうだけページ全体を撮る。縦に積み替わるので、窓に収まる範囲だけでは下の領域
 * （吹き出しと答え待ちの箱）が1枚に入らない。
 */
const SIZES = [
  { name: "wide", width: 1400, height: 900, fullPage: false },
  { name: "narrow", width: 720, height: 900, fullPage: true },
] as const

export type CatalogSize = (typeof SIZES)[number]

/**
 * 広い窓だけで撮る件。狭い窓は選択肢が角丸のボタンの縦並びで preview の面が出ず、
 * 目次の列も窓の幅が約 870px 未満では出ない。
 */
const WIDE_ONLY_NAMES: ReadonlySet<string> = new Set([
  "question-preview-image",
  "question-preview-image-missing",
  "report-new-section",
])

export function sizesOf(entry: CatalogEntry): readonly CatalogSize[] {
  return WIDE_ONLY_NAMES.has(entry.name) ? SIZES.filter((size) => size.name === "wide") : SIZES
}
