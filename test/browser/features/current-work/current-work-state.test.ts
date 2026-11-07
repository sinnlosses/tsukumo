import { describe, expect, it } from "vitest"

import {
  workToneOf,
  type CurrentWorkState,
  type WorkTone,
} from "../../../../src/browser/features/current-work/current-work-state.ts"

describe("workToneOf", () => {
  it.each([
    ["idle", "idle"],
    ["running", "working"],
    ["diary", "working"],
    ["background", "working"],
    ["pending", "pending"],
    ["stopped", "stopped"],
  ] as const satisfies readonly (readonly [CurrentWorkState, WorkTone])[])(
    "%s は %s に畳む",
    (state, tone) => {
      expect(workToneOf(state)).toBe(tone)
    },
  )
})
