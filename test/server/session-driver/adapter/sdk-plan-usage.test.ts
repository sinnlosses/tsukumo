import { describe, expect, it } from "vitest"

import { readPlanUsage } from "../../../../src/server/session-driver/adapter/sdk-plan-usage.ts"
import {
  NOT_APPLICABLE_PLAN_USAGE,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../../src/shared/plan-usage/plan-usage.ts"

/** SDK が実験中の口で返す形の抜粋（手で書いた架空の値。鍵の綴りは実測に合わせた snake_case）。 */
const SDK_PLAN_USAGE = {
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 34, resets_at: "2027-01-01T00:00:00Z" },
    seven_day: { utilization: 61, resets_at: "2027-01-08T00:00:00Z" },
  },
}

/** `readPlanUsage` が要る口だけを持つ偽のセッション。 */
function fakeSession(value: unknown): {
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: (opts: {
    skipBehaviors: boolean
  }) => Promise<unknown>
} {
  return {
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: () => Promise.resolve(value),
  }
}

describe("readPlanUsage", () => {
  it("SDK の形を画面が要る2つの枠に写す（戻る時刻はエポックミリ秒）", async () => {
    const report = await readPlanUsage(fakeSession(SDK_PLAN_USAGE))

    expect(report).toEqual({
      kind: "ready",
      usage: {
        fiveHour: {
          utilization: 34,
          resetsAt: Temporal.Instant.from("2027-01-01T00:00:00Z").epochMilliseconds,
        },
        sevenDay: {
          utilization: 61,
          resetsAt: Temporal.Instant.from("2027-01-08T00:00:00Z").epochMilliseconds,
        },
      },
    })
  })

  it("枠が丸ごと null のときは utilization・resetsAt とも undefined", async () => {
    const report = await readPlanUsage(
      fakeSession({
        rate_limits_available: true,
        rate_limits: { five_hour: null, seven_day: null },
      }),
    )

    expect(report).toEqual({
      kind: "ready",
      usage: {
        fiveHour: { utilization: undefined, resetsAt: undefined },
        sevenDay: { utilization: undefined, resetsAt: undefined },
      },
    })
  })

  it("枠はあるが utilization・resets_at が null のときはそれぞれ undefined", async () => {
    const report = await readPlanUsage(
      fakeSession({
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: null, resets_at: null },
          seven_day: { utilization: 61, resets_at: "2027-01-08T00:00:00Z" },
        },
      }),
    )

    expect(report.kind === "ready" ? report.usage.fiveHour : undefined).toEqual({
      utilization: undefined,
      resetsAt: undefined,
    })
  })

  it("rate_limits_available が false のときは「該当しない」（API キーなど。再読み込みしても変わらない）", async () => {
    const report = await readPlanUsage(
      fakeSession({ rate_limits_available: false, rate_limits: null }),
    )

    expect(report).toEqual(NOT_APPLICABLE_PLAN_USAGE)
  })

  it("読めない形が届いたら「取れない」（例外を投げない）", async () => {
    expect(await readPlanUsage(fakeSession({ rate_limits_available: "たくさん" }))).toEqual(
      UNAVAILABLE_PLAN_USAGE,
    )
    expect(await readPlanUsage(fakeSession(undefined))).toEqual(UNAVAILABLE_PLAN_USAGE)
  })

  it("SDK への問い合わせ自体が失敗しても「取れない」（例外を投げない）", async () => {
    const failing = {
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: () =>
        Promise.reject(new Error("架空の失敗")),
    }

    expect(await readPlanUsage(failing)).toEqual(UNAVAILABLE_PLAN_USAGE)
  })

  it("会話の中身に触らせないため skipBehaviors: true を必ず渡す", async () => {
    let received: { skipBehaviors: boolean } | undefined
    const session = {
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: (opts: {
        skipBehaviors: boolean
      }) => {
        received = opts
        return Promise.resolve(SDK_PLAN_USAGE)
      },
    }

    await readPlanUsage(session)

    expect(received).toEqual({ skipBehaviors: true })
  })
})
