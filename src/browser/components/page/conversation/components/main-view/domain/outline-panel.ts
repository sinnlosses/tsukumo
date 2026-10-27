// やり取りの列の幅と、利用者が選んだ畳み。`localStorage` にこの2つだけ保存する（会話は保存しない）。
// 読み書きに失敗しても既定へ落ちるだけで、例外は投げない。

import { isPlainObject } from "remeda"
import { z } from "zod"

import { localPreference } from "../../../../../../utils/local-preference.ts"

/**
 * 利用者が選んだ畳み。`unset` のあいだは札の幅で決まる（{@link isOutlineCollapsed}）。
 * 一度でも開く・畳むを選んだら、札の幅に関わらずその選択を使う。
 */
type OutlineCollapseChoice = "unset" | "collapsed" | "open"

export type OutlinePanel = {
  /**
   * ユーザーがドラッグで決めた幅（px）。
   * まだ一度も動かしていない間は `undefined` で、CSS の既定（`clamp(10rem, 22cqw, 15rem)`）に任せる。
   */
  readonly widthPx: number | undefined
  readonly collapse: OutlineCollapseChoice
}

const DEFAULT_OUTLINE_PANEL: OutlinePanel = {
  widthPx: undefined,
  collapse: "unset",
}

// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
const OUTLINE_WIDTH_MIN_PX = 128
const OUTLINE_WIDTH_MAX_PX = 384

const COLLAPSE_CHOICES = ["unset", "collapsed", "open"] satisfies readonly OutlineCollapseChoice[]

/** 実際に畳むか。選んでいなければ、札の幅が狭いときだけ畳む。 */
export function isOutlineCollapsed(choice: OutlineCollapseChoice, narrow: boolean): boolean {
  return choice === "unset" ? narrow : choice === "collapsed"
}

/** `LayoutResizer` の `toValue` にそのまま渡す。比率（0〜1）を可動域つきの px にする。 */
export function outlineWidthFromRatio(ratio: number, rect: DOMRect): number {
  return clampOutlineWidthPx(ratio * rect.width)
}

// 幅か畳みのどちらかが不正なら全体を既定に落とす。
const preference = localPreference(
  "tsukumo-outline-panel:v1",
  z.preprocess(
    (stored) =>
      isPlainObject(stored)
        ? {
            widthPx: stored["widthPx"],
            collapse: collapseChoiceOf(stored["collapse"], stored["collapsed"]),
          }
        : stored,
    z.object({
      widthPx: z.union([
        z.number().min(OUTLINE_WIDTH_MIN_PX).max(OUTLINE_WIDTH_MAX_PX),
        z.undefined(),
      ]),
      collapse: z.enum(COLLAPSE_CHOICES),
    }),
  ),
  DEFAULT_OUTLINE_PANEL,
)

export const loadOutlinePanel: () => OutlinePanel = preference.load

export const saveOutlinePanel: (value: OutlinePanel) => void = preference.save

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

function clampOutlineWidthPx(value: number): number {
  return Math.min(OUTLINE_WIDTH_MAX_PX, Math.max(OUTLINE_WIDTH_MIN_PX, value))
}
