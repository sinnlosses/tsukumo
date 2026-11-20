// 歯車の設定のうち、`:root` に差すもの（色・調整・動き）をまとめて差し直す。

import type { GearPreferences } from "../../shared/session/gear-preference.ts"
import { applyAppearanceAdjust } from "./appearance-adjust-root.ts"
import { applyAppearanceColorOverride } from "./appearance-color-root.ts"
import { applyMotionPreference } from "./motion-preference-root.ts"

export function applyGearPreferences(value: GearPreferences): void {
  applyAppearanceColorOverride(value.appearanceColor)
  applyAppearanceAdjust(value.appearanceAdjust)
  applyMotionPreference(value.motionPreference)
}
