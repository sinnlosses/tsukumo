import { afterEach, describe, expect, it } from "vitest"

import { planGearPreferenceMigration } from "../../../src/browser/domain/gear-preference-migration.ts"
import {
  holdMigratingGearPreferences,
  readLegacyGearPreferences,
  removeLegacyGearPreferences,
  sendMigratingGearPreferences,
  withMigratingGearPreferences,
} from "../../../src/browser/stores/gear-preference-legacy.ts"
import {
  BUILTIN_GEAR_PREFERENCES,
  type GearPreferenceChange,
  type GearPreferencesStored,
} from "../../../src/shared/session/gear-preference.ts"

const REVEAL_SPEED_KEY = "tsukumo-reveal-speed:v1"
const COLOR_KEY = "tsukumo-appearance-color:v1"

const NOTHING_STORED: GearPreferencesStored = {
  appearanceColor: false,
  appearanceAdjust: false,
  revealSpeed: false,
  motionPreference: false,
  launchSkill: false,
}

afterEach(() => {
  localStorage.clear()
  holdMigratingGearPreferences({})
})

/** ブラウザ側の入口と同じ順で、古い鍵を読んで写す欄を預ける。 */
function startMigration(stored: GearPreferencesStored): void {
  const plan = planGearPreferenceMigration(stored, readLegacyGearPreferences())
  holdMigratingGearPreferences(plan.toSend)
  removeLegacyGearPreferences(plan.removeNow)
}

describe("古い鍵から state.json へ写す", () => {
  it("写せた欄は鍵を消し、写すあいだはその値で描く", async () => {
    localStorage.setItem(REVEAL_SPEED_KEY, "fast")
    localStorage.setItem(COLOR_KEY, JSON.stringify({ ground: "#123456" }))
    startMigration(NOTHING_STORED)

    expect(withMigratingGearPreferences(BUILTIN_GEAR_PREFERENCES).revealSpeed).toBe("fast")
    const sent: GearPreferenceChange[] = []
    await sendMigratingGearPreferences(async (change) => {
      sent.push(change)
      return true
    })

    expect(sent).toEqual([
      { field: "appearanceColor", value: { ground: "#123456" } },
      { field: "revealSpeed", value: "fast" },
    ])
    expect(localStorage.getItem(REVEAL_SPEED_KEY)).toBeNull()
    expect(localStorage.getItem(COLOR_KEY)).toBeNull()
  })

  it("写せなかった欄は鍵を残し、このページでは写す値のまま描く。2回目は送らない", async () => {
    localStorage.setItem(REVEAL_SPEED_KEY, "off")
    startMigration(NOTHING_STORED)

    await sendMigratingGearPreferences(async () => false)

    expect(localStorage.getItem(REVEAL_SPEED_KEY)).toBe("off")
    expect(withMigratingGearPreferences(BUILTIN_GEAR_PREFERENCES).revealSpeed).toBe("off")
    const again: GearPreferenceChange[] = []
    await sendMigratingGearPreferences(async (change) => {
      again.push(change)
      return true
    })
    expect(again).toEqual([])
  })

  it("state.json に値がある欄は、送らずに鍵を消して state.json の値で描く", async () => {
    localStorage.setItem(REVEAL_SPEED_KEY, "fast")
    startMigration({ ...NOTHING_STORED, revealSpeed: true })

    expect(localStorage.getItem(REVEAL_SPEED_KEY)).toBeNull()
    const sent: GearPreferenceChange[] = []
    await sendMigratingGearPreferences(async (change) => {
      sent.push(change)
      return true
    })
    expect(sent).toEqual([])
    expect(
      withMigratingGearPreferences({ ...BUILTIN_GEAR_PREFERENCES, revealSpeed: "off" }).revealSpeed,
    ).toBe("off")
  })
})
