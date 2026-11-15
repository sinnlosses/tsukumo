// 使う人が変えられる3つの調整（背景の暗さ・パネルのぼかし・パネルの濃さ）を `localStorage` に持つ。
// 背景の暗さは「動かしていない」を `undefined` で表し、その間はパックの `veil` が効く。
// ぼかしと濃さは、保存が無いときの既定（`panel.css` の既定と同じ値）を持つ。
//
// `localStorage` から読み戻す値・範囲入力が渡す値のどちらも、範囲に収めるのはここだけ。

import { isPlainObject } from "remeda"
import { z } from "zod"

import {
  MAX_BACKGROUND_VEIL,
  MIN_BACKGROUND_VEIL,
} from "../../shared/character-pack/character-background.ts"
import { localPreference } from "../utils/local-preference.ts"
import type { RootTokenWrite } from "./appearance-color.ts"

export type AppearanceAdjust = {
  /** 背景の覆いの不透明度（0〜1）。`undefined` は動かしていない（パックの値に従う）。 */
  readonly veil?: number
  /** パネルのぼかし（px）。 */
  readonly blur: number
  /** パネルの濃さ（%）。 */
  readonly fill: number
}

export const BLUR_RANGE = { min: 0, max: 24 } as const
export const FILL_RANGE = { min: 20, max: 90 } as const
/** 背景の暗さの範囲（%）。下限は定義の側の下限と同じ。 */
export const VEIL_PERCENT_RANGE = {
  min: Math.round(MIN_BACKGROUND_VEIL * 100),
  max: Math.round(MAX_BACKGROUND_VEIL * 100),
} as const

export const DEFAULT_APPEARANCE_ADJUST: AppearanceAdjust = {
  veil: undefined,
  blur: 8,
  fill: 45,
}

const VEIL_TOKEN_NAME = "--character-background-veil-user"
const BLUR_TOKEN_NAME = "--panel-blur-user"
const FILL_TOKEN_NAME = "--panel-fill-user"

// 3項は項ごとに畳む（1項が壊れていても他の項は生かす）。
const veilOrUndefined = clampedNumber(MIN_BACKGROUND_VEIL, MAX_BACKGROUND_VEIL)
  .optional()
  .catch(undefined)
const blurOrDefault = clampedNumber(BLUR_RANGE.min, BLUR_RANGE.max).catch(
  DEFAULT_APPEARANCE_ADJUST.blur,
)
const fillOrDefault = clampedNumber(FILL_RANGE.min, FILL_RANGE.max).catch(
  DEFAULT_APPEARANCE_ADJUST.fill,
)

const preference = localPreference(
  "tsukumo-appearance-adjust:v1",
  z.preprocess(
    (stored) =>
      isPlainObject(stored)
        ? { veil: stored["veil"], blur: stored["blur"], fill: stored["fill"] }
        : {},
    z.object({ veil: veilOrUndefined, blur: blurOrDefault, fill: fillOrDefault }),
  ),
  DEFAULT_APPEARANCE_ADJUST,
)

export const loadAppearanceAdjust: () => AppearanceAdjust = preference.load

export const saveAppearanceAdjust: (value: AppearanceAdjust) => void = preference.save

/** 1つでも既定から動かしてあるか。「既定に戻す」を押せるかの判断に使う。 */
export function hasAppearanceAdjust(value: AppearanceAdjust): boolean {
  return (
    value.veil !== undefined ||
    value.blur !== DEFAULT_APPEARANCE_ADJUST.blur ||
    value.fill !== DEFAULT_APPEARANCE_ADJUST.fill
  )
}

/** 3つの調整を `:root` のトークンへ差す内容。動かしていない背景の暗さはトークンを外す。 */
export function appearanceAdjustTokenWrites(value: AppearanceAdjust): readonly RootTokenWrite[] {
  return [
    { name: VEIL_TOKEN_NAME, value: value.veil === undefined ? undefined : String(value.veil) },
    { name: BLUR_TOKEN_NAME, value: `${value.blur}px` },
    { name: FILL_TOKEN_NAME, value: `${value.fill}%` },
  ]
}

function clampedNumber(min: number, max: number) {
  return z
    .number()
    .finite()
    .transform((value) => Math.min(max, Math.max(min, value)))
}
