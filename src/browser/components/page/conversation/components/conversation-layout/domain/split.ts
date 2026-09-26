// レイアウトの領域の比率（3本の仕切りの位置）。`localStorage` に比率だけ保存する
// （会話は保存しない。`docs/design.md` 6.2）。読み書きに失敗しても既定へ落ちるだけで、
// 例外は投げない。

import { isPlainObject } from "remeda"

export type Split = {
  readonly rowTop: number
  readonly topLeft: number
  readonly bottomLeft: number
  /**
   * キャラビューを畳んでいるとき（雑談モード）の上下比。まだ一度も動かしていない間は
   * `undefined` で、読む側が `rowTop` に落とす（`<Layout>`）。`rowTop` の値をここへ
   * コピーして持たせない — 焼き付けると、あとから仕事の比率を変えたときに雑談側が
   * 追随しなくなる。
   */
  readonly collapsedRowTop: number | undefined
}

// 下段の左右は半々（ユーザーの指定）。
export const DEFAULT_SPLIT: Split = {
  rowTop: 65,
  topLeft: 75,
  bottomLeft: 50,
  collapsedRowTop: undefined,
}

// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
export const MIN_PERCENT = 15
export const MAX_PERCENT = 85

const STORAGE_KEY = "tsukumo-layout-split:v1"

export function clampPercent(value: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, value))
}

function isValidPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_PERCENT &&
    value <= MAX_PERCENT
  )
}

export function loadSplit(): Split {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULT_SPLIT
  }
  if (raw === null) {
    return DEFAULT_SPLIT
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (isPlainObject(parsed)) {
      const rowTop = parsed["rowTop"]
      const topLeft = parsed["topLeft"]
      const bottomLeft = parsed["bottomLeft"]
      const collapsedRowTop = parsed["collapsedRowTop"]
      if (isValidPercent(rowTop) && isValidPercent(topLeft) && isValidPercent(bottomLeft)) {
        // 雑談用の上下比だけは、無くても壊れていても `undefined` に畳むだけにする
        // （他の3項と違い DEFAULT_SPLIT 全体へは落とさない）。この項が無い保存値＝
        // 雑談で一度も動かしていない状態で、項を足す前に保存した値もそのまま読める。
        return {
          rowTop,
          topLeft,
          bottomLeft,
          collapsedRowTop: isValidPercent(collapsedRowTop) ? collapsedRowTop : undefined,
        }
      }
    }
  } catch {
    // 保存値が JSON として壊れている。既定に落ちる。
  }
  return DEFAULT_SPLIT
}

/**
 * 3本の比率と雑談の上下比が、すべて既定と同じか（「比率を既定に戻す」ピルを出すかの判定に使う。
 * `hooks/use-layout.ts`）。`collapsedRowTop` の `undefined` は既定として扱う（まだ一度も
 * 動かしていない状態なので、既定と違うとは言わない）。
 */
export function isDefaultSplit(split: Split): boolean {
  return (
    split.rowTop === DEFAULT_SPLIT.rowTop &&
    split.topLeft === DEFAULT_SPLIT.topLeft &&
    split.bottomLeft === DEFAULT_SPLIT.bottomLeft &&
    split.collapsedRowTop === DEFAULT_SPLIT.collapsedRowTop
  )
}

export function saveSplit(value: Split): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
