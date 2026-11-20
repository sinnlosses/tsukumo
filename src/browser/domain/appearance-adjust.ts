// 使う人が変えられる3つの調整（背景の暗さ・パネルのぼかし・パネルの濃さ）を `:root` へ差す内容の判断。
// 背景の暗さは「動かしていない」を `undefined` で表し、その間はパックの `veil` が効く。

import {
  MAX_BACKGROUND_VEIL,
  MIN_BACKGROUND_VEIL,
} from "../../shared/character-pack/character-background.ts"
import {
  DEFAULT_APPEARANCE_ADJUST,
  type AppearanceAdjust,
} from "../../shared/session/gear-preference.ts"
import type { RootTokenWrite } from "./appearance-color.ts"

/** 背景の暗さの範囲（%）。下限は定義の側の下限と同じ。 */
export const VEIL_PERCENT_RANGE = {
  min: Math.round(MIN_BACKGROUND_VEIL * 100),
  max: Math.round(MAX_BACKGROUND_VEIL * 100),
} as const

const VEIL_TOKEN_NAME = "--character-background-veil-user"
const BLUR_TOKEN_NAME = "--panel-blur-user"
const FILL_TOKEN_NAME = "--panel-fill-user"

/** 既定から動かしてある調整の数（0〜3）。 */
export function countAppearanceAdjust(value: AppearanceAdjust): number {
  return [
    value.veil !== undefined,
    value.blur !== DEFAULT_APPEARANCE_ADJUST.blur,
    value.fill !== DEFAULT_APPEARANCE_ADJUST.fill,
  ].filter(Boolean).length
}

/** 3つの調整を `:root` のトークンへ差す内容。動かしていない背景の暗さはトークンを外す。 */
export function appearanceAdjustTokenWrites(value: AppearanceAdjust): readonly RootTokenWrite[] {
  return [
    { name: VEIL_TOKEN_NAME, value: value.veil === undefined ? undefined : String(value.veil) },
    { name: BLUR_TOKEN_NAME, value: `${value.blur}px` },
    { name: FILL_TOKEN_NAME, value: `${value.fill}%` },
  ]
}
