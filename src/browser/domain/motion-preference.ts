// 「動きを減らす」の好みを `localStorage` に持つ。
// `system` は OS の設定（`prefers-reduced-motion`）に従う既定、`reduce` は OS の設定が無くても減らす。
// どちらかが立っていれば減らす扱いで、その合成は `prefersReducedMotion` が行う。

import { z } from "zod"

import { localPreference, RAW_STRING_CODEC } from "../utils/local-preference.ts"

export type MotionPreference = "system" | "reduce"

export const DEFAULT_MOTION_PREFERENCE: MotionPreference = "system"

/** `<select>` に出す順とラベル。 */
export const MOTION_PREFERENCE_LABELS = [
  ["system", "OS の設定に従う"],
  ["reduce", "減らす"],
] satisfies readonly (readonly [MotionPreference, string])[]

const preference = localPreference(
  "tsukumo-motion-preference:v1",
  z.custom<MotionPreference>((value) => typeof value === "string" && isMotionPreference(value)),
  DEFAULT_MOTION_PREFERENCE,
  RAW_STRING_CODEC,
)

export const loadMotionPreference: () => MotionPreference = preference.load

export const saveMotionPreference: (value: MotionPreference) => void = preference.save

export function isMotionPreference(value: string): value is MotionPreference {
  return MOTION_PREFERENCE_LABELS.some(([item]) => item === value)
}
