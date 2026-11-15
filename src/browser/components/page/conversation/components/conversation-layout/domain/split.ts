// レイアウトの2本の仕切りの位置。`localStorage` には幅だけ保存する（会話は保存しない）。
// 左の列は px、サイドバーは器の幅に対する %。
// 読み書きに失敗しても既定へ落ちるだけで、例外は投げない。

import { clamp, isPlainObject, round } from "remeda"
import { z } from "zod"

import { localPreference } from "../../../../../../utils/local-preference.ts"

export type Split = {
  /** 左の列（立ち絵と席）の幅（px）。 */
  readonly leftPx: number
  /** サイドバーの幅（器の幅に対する %）。 */
  readonly sidebar: number
}

type SavedSplit = {
  readonly leftPx?: number
  readonly sidebar: number
}

// 既定は見本（1400x900）の左の列 238px・サイドバー 319px。
export const DEFAULT_SPLIT: Split = {
  leftPx: 238,
  sidebar: 22.8,
}

/** 左の列の仕切りの `toValue` にそのまま渡す。器の左端からの位置を、可動域つきの px にする。 */
export function leftPxFromRatio(ratio: number, rect: DOMRect): number {
  return clampLeftPx(ratio * rect.width)
}

/** サイドバーの仕切りの `toValue` にそのまま渡す。器の左端からの比率（0〜1）を、右端からの幅（可動域つきの %）にする。 */
export function sidebarPercentFromRatio(ratio: number): number {
  return round(clamp((1 - ratio) * 100, { min: SIDEBAR_MIN_PERCENT, max: SIDEBAR_MAX_PERCENT }), 1)
}

/**
 * 保存が無い・壊れているときは既定を返す。
 * 左の列の幅だけは、v2 に無ければ前の版が持っていたやり取りの列の幅を引き継ぐ。
 */
export function loadSplit(): Split {
  const saved = preference.load()
  return { ...saved, leftPx: saved.leftPx ?? inheritedLeftPx() }
}

export const saveSplit: (value: Split) => void = (value) => {
  preference.save(value)
}

// 左の列の可動域（px）。
const LEFT_MIN_PX = 200
const LEFT_MAX_PX = 400

// サイドバーをどちらかの端まで詰めて操作不能にしないための可動域（%）。
const SIDEBAR_MIN_PERCENT = 15
const SIDEBAR_MAX_PERCENT = 40

function clampLeftPx(px: number): number {
  return clamp(px, { min: LEFT_MIN_PX, max: LEFT_MAX_PX })
}

// v1（3本の比率）の鍵は読まない。消しもしない。
// 左の列の幅が無い保存値は、読むときに `inheritedLeftPx` で補う。
const preference = localPreference<SavedSplit>(
  "tsukumo-layout-split:v2",
  z.preprocess(
    (stored) =>
      isPlainObject(stored) ? { leftPx: stored["leftPx"], sidebar: stored["sidebar"] } : stored,
    z.object({
      leftPx: z.number().transform(clampLeftPx).optional().catch(undefined),
      sidebar: z.number().min(SIDEBAR_MIN_PERCENT).max(SIDEBAR_MAX_PERCENT),
    }),
  ),
  { sidebar: DEFAULT_SPLIT.sidebar },
)

// 前の版のやり取りの列の幅（`widthPx`）が、左の列の幅の引き継ぎ元。
// 鍵はやり取りの列の保存と同じ字で、幅だけを読む（書き込まない）。
const legacyOutlinePreference = localPreference(
  "tsukumo-outline-panel:v1",
  z.preprocess(
    (stored) => (isPlainObject(stored) ? { widthPx: stored["widthPx"] } : stored),
    z.object({ widthPx: z.number().transform(clampLeftPx).optional().catch(undefined) }),
  ),
  { widthPx: undefined },
)

function inheritedLeftPx(): number {
  return legacyOutlinePreference.load().widthPx ?? DEFAULT_SPLIT.leftPx
}
