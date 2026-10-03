// タスクのモーダルの左の一覧の幅。`localStorage` に幅（px）だけ保存する。
// 読み書きに失敗しても既定（CSS の 470px）へ落ちるだけで、例外は投げない。

// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
// 一覧の最小幅と詳細の最小幅は、CSS の `.task-board-list-column` の `clamp` と揃える。
export const TASK_BOARD_LIST_WIDTH_MIN_PX = 300
export const TASK_BOARD_LIST_WIDTH_MAX_PX = 760
const DETAIL_MIN_PX = 360

const STORAGE_KEY = "tsukumo-task-board-list-width:v1"

/** `LayoutResizer` の `toValue` にそのまま渡す。比率（0〜1）を、詳細の幅を残した可動域つきの px にする。 */
export function taskBoardListWidthFromRatio(ratio: number, rect: DOMRect): number {
  const max = Math.min(TASK_BOARD_LIST_WIDTH_MAX_PX, rect.width - DETAIL_MIN_PX)
  return Math.max(TASK_BOARD_LIST_WIDTH_MIN_PX, Math.min(max, Math.round(ratio * rect.width)))
}

/** 保存した幅。まだ一度も動かしていない・読めないときは `undefined`（CSS の既定に任せる）。 */
export function loadTaskBoardListWidth(): number | undefined {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return undefined
  }
  if (raw === null) {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) &&
    value >= TASK_BOARD_LIST_WIDTH_MIN_PX &&
    value <= TASK_BOARD_LIST_WIDTH_MAX_PX
    ? value
    : undefined
}

export function saveTaskBoardListWidth(px: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(px))
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
