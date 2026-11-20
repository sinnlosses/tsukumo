import { describe, expect, it } from "vitest"

import { parseGearPreferenceSeed } from "../../../src/browser/domain/gear-preference-seed.ts"
import { BUILTIN_GEAR_PREFERENCES } from "../../../src/shared/session/gear-preference.ts"

const NOTHING_STORED = {
  appearanceColor: false,
  appearanceAdjust: false,
  revealSpeed: false,
  motionPreference: false,
  launchSkill: false,
}

describe("parseGearPreferenceSeed", () => {
  it("塊が無いときは既定で、stored は全部偽", () => {
    expect(parseGearPreferenceSeed(undefined)).toEqual({
      values: BUILTIN_GEAR_PREFERENCES,
      stored: NOTHING_STORED,
    })
  })

  it("JSON として壊れた塊は既定で、stored は全部偽", () => {
    expect(parseGearPreferenceSeed("{ 壊れた")).toEqual({
      values: BUILTIN_GEAR_PREFERENCES,
      stored: NOTHING_STORED,
    })
  })

  it("一部の欄だけ壊れた塊は、その欄だけ既定に畳み、stored も偽にする", () => {
    const seed = JSON.stringify({
      values: {
        ...BUILTIN_GEAR_PREFERENCES,
        appearanceColor: { ground: "#101010" },
        revealSpeed: "とても速い",
        motionPreference: "reduce",
      },
      stored: {
        ...NOTHING_STORED,
        appearanceColor: true,
        revealSpeed: true,
        motionPreference: true,
      },
    })

    expect(parseGearPreferenceSeed(seed)).toEqual({
      values: {
        ...BUILTIN_GEAR_PREFERENCES,
        appearanceColor: { ground: "#101010" },
        motionPreference: "reduce",
      },
      stored: { ...NOTHING_STORED, appearanceColor: true, motionPreference: true },
    })
  })
})
