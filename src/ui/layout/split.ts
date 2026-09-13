// レイアウトの領域の比率（3本の仕切りの位置）。**`localStorage` に比率だけ保存する**
// （会話は保存しない。`docs/design.md` 6.2）。読み書きに失敗しても既定へ落ちるだけで、
// 例外は投げない。

export type Split = {
  readonly rowTop: number
  readonly topLeft: number
  readonly bottomLeft: number
}

// 下段の左右は半々（ユーザーの指定）。
export const DEFAULT_SPLIT: Split = { rowTop: 60, topLeft: 75, bottomLeft: 50 }

// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
export const MIN_PERCENT = 15
export const MAX_PERCENT = 85

const STORAGE_KEY = "tsukumo-layout-split"

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
    if (parsed !== null && typeof parsed === "object") {
      const rowTop = (parsed as Record<string, unknown>)["rowTop"]
      const topLeft = (parsed as Record<string, unknown>)["topLeft"]
      const bottomLeft = (parsed as Record<string, unknown>)["bottomLeft"]
      if (isValidPercent(rowTop) && isValidPercent(topLeft) && isValidPercent(bottomLeft)) {
        return { rowTop, topLeft, bottomLeft }
      }
    }
  } catch {
    // 保存値が JSON として壊れている。既定に落ちる。
  }
  return DEFAULT_SPLIT
}

export function saveSplit(value: Split): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
