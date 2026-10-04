// 目次の幅と、利用者が選んだ畳み。`localStorage` にこの2つだけ保存する（会話は保存しない）。
// 読み書きに失敗しても既定へ落ちるだけで、例外は投げない。

import { isPlainObject } from "remeda"

/**
 * 利用者が選んだ畳み。`unset` のあいだは札の幅で決まる（{@link isOutlineCollapsed}）。
 * 一度でも開く・畳むを選んだら、札の幅に関わらずその選択を使う。
 */
export type OutlineCollapseChoice = "unset" | "collapsed" | "open"

export type OutlinePanel = {
  /**
   * ユーザーがドラッグで決めた幅（px）。
   * まだ一度も動かしていない間は `undefined` で、CSS の既定（`clamp(10rem, 22cqw, 15rem)`）に任せる。
   */
  readonly widthPx: number | undefined
  readonly collapse: OutlineCollapseChoice
}

export const DEFAULT_OUTLINE_PANEL: OutlinePanel = {
  widthPx: undefined,
  collapse: "unset",
}

// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
export const OUTLINE_WIDTH_MIN_PX = 128
export const OUTLINE_WIDTH_MAX_PX = 384

const STORAGE_KEY = "tsukumo-outline-panel:v1"

const COLLAPSE_CHOICES: readonly OutlineCollapseChoice[] = ["unset", "collapsed", "open"]

/** 実際に畳むか。選んでいなければ、札の幅が狭いときだけ畳む。 */
export function isOutlineCollapsed(choice: OutlineCollapseChoice, narrow: boolean): boolean {
  return choice === "unset" ? narrow : choice === "collapsed"
}

/** `LayoutResizer` の `toValue` にそのまま渡す。比率（0〜1）を可動域つきの px にする。 */
export function outlineWidthFromRatio(ratio: number, rect: DOMRect): number {
  return clampOutlineWidthPx(ratio * rect.width)
}

function clampOutlineWidthPx(value: number): number {
  return Math.min(OUTLINE_WIDTH_MAX_PX, Math.max(OUTLINE_WIDTH_MIN_PX, value))
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
      const collapse = collapseChoiceOf(parsed["collapse"], parsed["collapsed"])
      if ((widthPx === undefined || isValidWidthPx(widthPx)) && collapse !== undefined) {
        return { widthPx, collapse }
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

/**
 * 保存値の畳みを読む。旧い形（`collapsed: boolean`）も読み、`true` は畳む、`false` は選んでいないに読む。
 * 旧い形では幅をドラッグしただけでも `false` が書かれていたので、開くを選んだ印にはならない。
 */
function collapseChoiceOf(
  collapse: unknown,
  legacyCollapsed: unknown,
): OutlineCollapseChoice | undefined {
  const found = COLLAPSE_CHOICES.find((choice) => choice === collapse)
  if (found !== undefined) {
    return found
  }
  if (typeof legacyCollapsed === "boolean") {
    return legacyCollapsed ? "collapsed" : "unset"
  }
  return undefined
}

function isValidWidthPx(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= OUTLINE_WIDTH_MIN_PX &&
    value <= OUTLINE_WIDTH_MAX_PX
  )
}
