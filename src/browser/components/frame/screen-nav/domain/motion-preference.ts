// 「動きを減らす」の好みの、画面に出すラベル。
// どちらかが立っていれば減らす扱いで、OS の設定との合成は `prefersReducedMotion` が行う。

import {
  MOTION_PREFERENCES,
  type MotionPreference,
} from "../../../../../shared/session/gear-preference.ts"

/** `<select>` に出す順とラベル。 */
export const MOTION_PREFERENCE_LABELS = [
  ["system", "OS の設定に従う"],
  ["reduce", "減らす"],
] satisfies readonly (readonly [MotionPreference, string])[]

export function isMotionPreference(value: string): value is MotionPreference {
  return MOTION_PREFERENCES.some((item) => item === value)
}
