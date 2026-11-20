// ページの HTML に焼かれた歯車の設定の塊（`GEAR_PREFERENCE_SEED_ELEMENT_ID`）を読む。
// 塊が無い・壊れているときは既定で描き始め、`stored` は全部偽（`state.json` に値が無いのと同じ扱い）。
// 一部の欄だけ壊れているときは、その欄だけ既定に畳む。

import { z } from "zod"

import {
  foldGearPreferences,
  type FoldedGearPreferences,
  type GearPreferenceField,
} from "../../shared/session/gear-preference.ts"

const seedSchema = z.object({
  values: z.unknown(),
  stored: z.record(z.string(), z.unknown()).catch({}),
})

/** 塊の文字列（`textContent`）を受けて畳む。 */
export function parseGearPreferenceSeed(text?: string): FoldedGearPreferences {
  const seed = seedSchema.safeParse(parseJson(text))
  if (!seed.success) {
    return foldGearPreferences(undefined)
  }
  const folded = foldGearPreferences(seed.data.values)
  // 値が読めても、サーバが「覚えた値ではない（既定へ畳んだ値）」と言う欄は覚えていない扱いにする。
  const storedOf = (field: GearPreferenceField): boolean =>
    folded.stored[field] && seed.data.stored[field] === true
  return {
    values: folded.values,
    stored: {
      appearanceColor: storedOf("appearanceColor"),
      appearanceAdjust: storedOf("appearanceAdjust"),
      revealSpeed: storedOf("revealSpeed"),
      motionPreference: storedOf("motionPreference"),
      launchSkill: storedOf("launchSkill"),
    },
  }
}

function parseJson(text?: string): unknown {
  if (text === undefined) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed
  } catch {
    // 壊れた塊は「塊が無い」と同じく既定で描き始めればよく、知らせる先も無い。
    return undefined
  }
}
