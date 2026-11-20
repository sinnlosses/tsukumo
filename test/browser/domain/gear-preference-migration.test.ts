import { describe, expect, it } from "vitest"

import {
  type LegacyGearPreferences,
  planGearPreferenceMigration,
} from "../../../src/browser/domain/gear-preference-migration.ts"
import type { GearPreferencesStored } from "../../../src/shared/session/gear-preference.ts"

const NOTHING_STORED: GearPreferencesStored = {
  appearanceColor: false,
  appearanceAdjust: false,
  revealSpeed: false,
  motionPreference: false,
  launchSkill: false,
}

const NO_LEGACY: LegacyGearPreferences = {
  appearanceColor: { kind: "absent" },
  appearanceAdjust: { kind: "absent" },
  revealSpeed: { kind: "absent" },
  motionPreference: { kind: "absent" },
  launchSkill: { kind: "absent" },
}

describe("planGearPreferenceMigration", () => {
  it("state.json に値があれば、古い鍵の読める値は送らずに消す", () => {
    const plan = planGearPreferenceMigration(
      { ...NOTHING_STORED, revealSpeed: true },
      { ...NO_LEGACY, revealSpeed: { kind: "value", value: "fast" } },
    )

    expect(plan.toSend.revealSpeed).toBeUndefined()
    expect(plan.removeNow).toEqual(["revealSpeed"])
  })

  it("state.json に値があれば、壊れた古い鍵も送らずに消す", () => {
    const plan = planGearPreferenceMigration(
      { ...NOTHING_STORED, launchSkill: true },
      { ...NO_LEGACY, launchSkill: { kind: "broken" } },
    )

    expect(plan.toSend.launchSkill).toBeUndefined()
    expect(plan.removeNow).toEqual(["launchSkill"])
  })

  it("state.json に値があり古い鍵が無ければ、何もしない", () => {
    const plan = planGearPreferenceMigration({ ...NOTHING_STORED, revealSpeed: true }, NO_LEGACY)

    expect(plan.toSend).toEqual({})
    expect(plan.removeNow).toEqual([])
  })

  it("state.json に値が無ければ、古い鍵の読める値を写す欄にし、まだ消さない", () => {
    const plan = planGearPreferenceMigration(NOTHING_STORED, {
      ...NO_LEGACY,
      appearanceColor: { kind: "value", value: { ground: undefined, surface: undefined } },
      motionPreference: { kind: "value", value: "reduce" },
    })

    expect(plan.toSend).toEqual({
      appearanceColor: { ground: undefined, surface: undefined },
      motionPreference: "reduce",
    })
    expect(plan.removeNow).toEqual([])
  })

  it("state.json に値が無く古い鍵が壊れていれば、送らずに消す", () => {
    const plan = planGearPreferenceMigration(NOTHING_STORED, {
      ...NO_LEGACY,
      appearanceAdjust: { kind: "broken" },
    })

    expect(plan.toSend.appearanceAdjust).toBeUndefined()
    expect(plan.removeNow).toEqual(["appearanceAdjust"])
  })

  it("state.json にも古い鍵にも値が無ければ、何もしない", () => {
    const plan = planGearPreferenceMigration(NOTHING_STORED, NO_LEGACY)

    expect(plan.toSend).toEqual({})
    expect(plan.removeNow).toEqual([])
  })
})
