// 歯車の設定を `localStorage` に持っていたころの5つの鍵と、`state.json` へ写すあいだの値。
// 写すのはページを開いたときの1回で、手順は `planGearPreferenceMigration` が決める。
// 写している最中は、届いた姿の値（写す前の既定）より写す値を優先して描く（既定の色が一瞬出ないように）。

import {
  STORED_GEAR_PREFERENCE_SCHEMAS,
  type GearPreferenceChange,
  type GearPreferenceField,
  type GearPreferences,
  type StoredGearPreferences,
} from "../../shared/session/gear-preference.ts"
import type { LegacyGearPreferences } from "../domain/gear-preference-migration.ts"
import {
  legacyPreference,
  RAW_STRING_CODEC,
  type LegacyPreference,
} from "../utils/local-preference.ts"

const LEGACY_PREFERENCES = {
  appearanceColor: legacyPreference(
    "tsukumo-appearance-color:v1",
    STORED_GEAR_PREFERENCE_SCHEMAS.appearanceColor,
  ),
  appearanceAdjust: legacyPreference(
    "tsukumo-appearance-adjust:v1",
    STORED_GEAR_PREFERENCE_SCHEMAS.appearanceAdjust,
  ),
  revealSpeed: legacyPreference(
    "tsukumo-reveal-speed:v1",
    STORED_GEAR_PREFERENCE_SCHEMAS.revealSpeed,
    RAW_STRING_CODEC,
  ),
  motionPreference: legacyPreference(
    "tsukumo-motion-preference:v1",
    STORED_GEAR_PREFERENCE_SCHEMAS.motionPreference,
    RAW_STRING_CODEC,
  ),
  launchSkill: legacyPreference(
    "tsukumo-launch-skill:v1",
    STORED_GEAR_PREFERENCE_SCHEMAS.launchSkill,
    RAW_STRING_CODEC,
  ),
} satisfies { readonly [Field in GearPreferenceField]: LegacyPreference<GearPreferences[Field]> }

/** 写している最中の値。写せた欄から外す。 */
let migrating: StoredGearPreferences = {}
/** まだ送っていない欄。送り始めたら空にし、2回目の `hello` で送り直さない。 */
let unsent: StoredGearPreferences = {}

export function readLegacyGearPreferences(): LegacyGearPreferences {
  return {
    appearanceColor: LEGACY_PREFERENCES.appearanceColor.read(),
    appearanceAdjust: LEGACY_PREFERENCES.appearanceAdjust.read(),
    revealSpeed: LEGACY_PREFERENCES.revealSpeed.read(),
    motionPreference: LEGACY_PREFERENCES.motionPreference.read(),
    launchSkill: LEGACY_PREFERENCES.launchSkill.read(),
  }
}

export function removeLegacyGearPreferences(fields: readonly GearPreferenceField[]): void {
  for (const field of fields) {
    LEGACY_PREFERENCES[field].remove()
  }
}

/** 描き始める前に1回、写す欄を預ける。 */
export function holdMigratingGearPreferences(toSend: StoredGearPreferences): void {
  migrating = toSend
  unsent = toSend
}

/** 届いた値に、写している最中の欄を重ねる。 */
export function withMigratingGearPreferences(base: GearPreferences): GearPreferences {
  return {
    appearanceColor: migrating.appearanceColor ?? base.appearanceColor,
    appearanceAdjust: migrating.appearanceAdjust ?? base.appearanceAdjust,
    revealSpeed: migrating.revealSpeed ?? base.revealSpeed,
    motionPreference: migrating.motionPreference ?? base.motionPreference,
    launchSkill: migrating.launchSkill ?? base.launchSkill,
  }
}

/**
 * 預けた欄をサーバへ1欄ずつ写し、写せた欄の鍵を消す。最初の `hello` を受けたところで1回だけ呼ぶ。
 * `send` は覚えさせられたら真。写せなかった欄は鍵を残し、このページでは写す値のまま描く（次に開いたときにまた写す）。
 */
export async function sendMigratingGearPreferences(
  send: (change: GearPreferenceChange) => Promise<boolean>,
): Promise<void> {
  const pending = unsent
  unsent = {}
  const settle = async (change: GearPreferenceChange): Promise<void> => {
    if (await send(change)) {
      LEGACY_PREFERENCES[change.field].remove()
      migrating = { ...migrating, [change.field]: undefined }
    }
  }
  await Promise.all([
    pending.appearanceColor === undefined
      ? undefined
      : settle({ field: "appearanceColor", value: pending.appearanceColor }),
    pending.appearanceAdjust === undefined
      ? undefined
      : settle({ field: "appearanceAdjust", value: pending.appearanceAdjust }),
    pending.revealSpeed === undefined
      ? undefined
      : settle({ field: "revealSpeed", value: pending.revealSpeed }),
    pending.motionPreference === undefined
      ? undefined
      : settle({ field: "motionPreference", value: pending.motionPreference }),
    pending.launchSkill === undefined
      ? undefined
      : settle({ field: "launchSkill", value: pending.launchSkill }),
  ])
}
