// 目次の幅と畳みの状態。`localStorage` にこの2つだけ保存する（会話は保存しない）。
// 読み書きに失敗しても既定へ落ちるだけで、例外は投げない。

import { isPlainObject } from "remeda"

export type OutlinePanel = {
  /**
   * ユーザーがドラッグで決めた幅（px）。
   * まだ一度も動かしていない間は `undefined` で、CSS の既定（`clamp(10rem, 22cqw, 15rem)`）に任せる。
   */
  readonly widthPx: number | undefined
  readonly collapsed: boolean
}

export const DEFAULT_OUTLINE_PANEL: OutlinePanel = {
  widthPx: undefined,
  collapsed: false,
}

// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
export const OUTLINE_WIDTH_MIN_PX = 128
export const OUTLINE_WIDTH_MAX_PX = 384

const STORAGE_KEY = "tsukumo-outline-panel:v1"

export function clampOutlineWidthPx(value: number): number {
  return Math.min(OUTLINE_WIDTH_MAX_PX, Math.max(OUTLINE_WIDTH_MIN_PX, value))
}

/** `LayoutResizer` の `toValue` にそのまま渡す。比率（0〜1）を可動域つきの px にする。 */
export function outlineWidthFromRatio(ratio: number, rect: DOMRect): number {
  return clampOutlineWidthPx(ratio * rect.width)
}

function isValidWidthPx(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= OUTLINE_WIDTH_MIN_PX &&
    value <= OUTLINE_WIDTH_MAX_PX
  )
}

export function loadOutlinePanel(): OutlinePanel {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULT_OUTLINE_PANEL
  }
  if (raw === null) {
    return DEFAULT_OUTLINE_PANEL
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (isPlainObject(parsed)) {
      const widthPx = parsed["widthPx"]
      const collapsed = parsed["collapsed"]
      if ((widthPx === undefined || isValidWidthPx(widthPx)) && typeof collapsed === "boolean") {
        return { widthPx, collapsed }
      }
    }
  } catch {
    // 保存値が JSON として壊れている。既定に落ちる。
  }
  return DEFAULT_OUTLINE_PANEL
}

export function saveOutlinePanel(value: OutlinePanel): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
