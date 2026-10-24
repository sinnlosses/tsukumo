// レイアウトの領域の比率（3本の仕切りの位置）。`localStorage` に比率だけ保存する（会話は保存しない）。
// 読み書きに失敗しても既定へ落ちるだけで、例外は投げない。

import { isPlainObject } from "remeda"
import { z } from "zod"

import { localPreference } from "../../../../../../utils/local-preference.ts"

export type Split = {
  readonly rowTop: number
  readonly topLeft: number
  readonly bottomLeft: number
  /**
   * キャラビューを畳んでいるとき（雑談モード）の上下比。
   * まだ一度も動かしていない間は `undefined` で、読む側が `rowTop` に落とす。
   * `rowTop` の値をここへコピーして持たせない（焼き付けると、あとから仕事の比率を変えたときに雑談側が追随しなくなる）。
   */
  readonly collapsedRowTop: number | undefined
}

// 下段の左右は半々。
export const DEFAULT_SPLIT: Split = {
  rowTop: 65,
  topLeft: 75,
  bottomLeft: 50,
  collapsedRowTop: undefined,
}

// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
const MIN_PERCENT = 15
const MAX_PERCENT = 85

const percent = z.number().min(MIN_PERCENT).max(MAX_PERCENT)

// 雑談用の上下比だけは、無くても壊れていても `undefined` に畳むだけにする（他の3項と違い DEFAULT_SPLIT 全体へは落とさない）。
// この項が無い保存値＝雑談で一度も動かしていない状態で、項を足す前に保存した値もそのまま読める。
// キーが欠けた項は `undefined` として項の schema に渡す。
const preference = localPreference(
  "tsukumo-layout-split:v1",
  z.preprocess(
    (stored) =>
      isPlainObject(stored)
        ? {
            rowTop: stored["rowTop"],
            topLeft: stored["topLeft"],
            bottomLeft: stored["bottomLeft"],
            collapsedRowTop: stored["collapsedRowTop"],
          }
        : stored,
    z.object({
      rowTop: percent,
      topLeft: percent,
      bottomLeft: percent,
      collapsedRowTop: z.union([percent, z.undefined()]).catch(undefined),
    }),
  ),
  DEFAULT_SPLIT,
)

/** `LayoutResizer` の `toValue` にそのまま渡す。比率（0〜1）を可動域つきの % にする。 */
export function percentFromRatio(ratio: number): number {
  return clampPercent(ratio * 100)
}

export const loadSplit: () => Split = preference.load

/**
 * 3本の比率と雑談の上下比が、すべて既定と同じか。
 * `collapsedRowTop` の `undefined` は既定として扱う（まだ一度も動かしていない状態なので、既定と違うとは言わない）。
 */
export function isDefaultSplit(split: Split): boolean {
  return (
    split.rowTop === DEFAULT_SPLIT.rowTop &&
    split.topLeft === DEFAULT_SPLIT.topLeft &&
    split.bottomLeft === DEFAULT_SPLIT.bottomLeft &&
    split.collapsedRowTop === DEFAULT_SPLIT.collapsedRowTop
  )
}

export const saveSplit: (value: Split) => void = preference.save

function clampPercent(value: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, value))
}
