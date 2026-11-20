// 歯車の設定を `localStorage` から `state.json` へ移す手順を、欄ごとに決める。
// `state.json` に値がある欄はそちらが勝ち、古い鍵は送らずに消す。
// 値が無い欄は `localStorage` の読める値をサーバへ写し、写せたら消す（失敗なら残して次に開いたときにまた移す）。
// 壊れた古い鍵は送らずに消す。

import type {
  GearPreferenceField,
  GearPreferences,
  GearPreferencesStored,
  StoredGearPreferences,
} from "../../shared/session/gear-preference.ts"
import type { LegacyPreferenceRead } from "../utils/local-preference.ts"

/** 欄ごとの古い鍵の読み。 */
export type LegacyGearPreferences = {
  readonly [Field in GearPreferenceField]: LegacyPreferenceRead<GearPreferences[Field]>
}

export type GearPreferenceMigration = {
  /** サーバへ写す欄。写せるまでは、塊の値に重ねてこの値で描く。写せたら鍵を消す。 */
  readonly toSend: StoredGearPreferences
  /** 送らずにすぐ消す鍵の欄。 */
  readonly removeNow: readonly GearPreferenceField[]
}

/** `seed` は塊の欄ごとの「`state.json` に読める値があったか」。 */
export function planGearPreferenceMigration(
  seed: GearPreferencesStored,
  legacy: LegacyGearPreferences,
): GearPreferenceMigration {
  const appearanceColor = planField(seed.appearanceColor, legacy.appearanceColor)
  const appearanceAdjust = planField(seed.appearanceAdjust, legacy.appearanceAdjust)
  const revealSpeed = planField(seed.revealSpeed, legacy.revealSpeed)
  const motionPreference = planField(seed.motionPreference, legacy.motionPreference)
  const launchSkill = planField(seed.launchSkill, legacy.launchSkill)
  return {
    toSend: {
      appearanceColor: appearanceColor.send,
      appearanceAdjust: appearanceAdjust.send,
      revealSpeed: revealSpeed.send,
      motionPreference: motionPreference.send,
      launchSkill: launchSkill.send,
    },
    removeNow: [
      ...removeNowOf("appearanceColor", appearanceColor),
      ...removeNowOf("appearanceAdjust", appearanceAdjust),
      ...removeNowOf("revealSpeed", revealSpeed),
      ...removeNowOf("motionPreference", motionPreference),
      ...removeNowOf("launchSkill", launchSkill),
    ],
  }
}

type FieldPlan<Value> = {
  /** 写す値。写さない欄は無い。 */
  readonly send?: Value
  readonly removeNow: boolean
}

function removeNowOf(field: GearPreferenceField, plan: FieldPlan<unknown>): GearPreferenceField[] {
  return plan.removeNow ? [field] : []
}

function planField<Value>(stored: boolean, legacy: LegacyPreferenceRead<Value>): FieldPlan<Value> {
  if (legacy.kind === "absent") {
    return { removeNow: false }
  }
  if (stored || legacy.kind === "broken") {
    return { removeNow: true }
  }
  return { send: legacy.value, removeNow: false }
}
