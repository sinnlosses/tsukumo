import { describe, expect, it } from "bun:test"

import { planName } from "../../../src/server/core/plan.ts"

/** 控えが何も持っていないときの形（読めなかった回と同じ）。 */
const NO_TIER = { organizationType: undefined, rateLimitTier: undefined }

describe("planName", () => {
  it("枠に倍率があれば、段と倍率を並べた名前にする", () => {
    expect(
      planName(
        { organizationType: "claude_max", rateLimitTier: "default_claude_max_20x" },
        "Claude Pro",
      ),
    ).toBe("Max 20x")
  })

  it("倍率の無い枠は段だけの名前になる", () => {
    expect(
      planName({ organizationType: undefined, rateLimitTier: "default_claude_pro" }, undefined),
    ).toBe("Pro")
  })

  it("枠が無くても段だけで名前を決められる", () => {
    expect(planName({ organizationType: "claude_team", rateLimitTier: undefined }, undefined)).toBe(
      "Team",
    )
  })

  it("控えから決まるときは、SDK の値が違っていてもそちらを使わない", () => {
    // SDK の `subscriptionType` は Max の契約でも "Claude Pro" を返すことがある（実測）。
    expect(
      planName({ organizationType: "claude_max", rateLimitTier: undefined }, "Claude Pro"),
    ).toBe("Max")
  })

  it("控えが読めなかった回は SDK の値をそのまま出す", () => {
    expect(planName(NO_TIER, "Claude Pro")).toBe("Claude Pro")
  })

  it("知らない綴りは訳さず、SDK の値へ落ちる", () => {
    expect(
      planName({ organizationType: "ACME_ENTERPRISE", rateLimitTier: "custom_tier" }, "Claude Pro"),
    ).toBe("Claude Pro")
  })

  it("どちらからも決まらなければ何も返さない（画面は札を出さない）", () => {
    expect(planName(NO_TIER, undefined)).toBeUndefined()
    expect(planName(NO_TIER, "   ")).toBeUndefined()
  })
})
