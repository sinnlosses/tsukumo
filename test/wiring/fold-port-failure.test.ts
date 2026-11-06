import { describe, expect, it } from "vitest"

import type { SwallowedFailurePlace } from "../../src/shared/diagnostic/swallowed-failure.ts"
import { foldPortFailure } from "../../src/wiring/fold-port-failure.ts"

const PLACE = {
  feature: "repository",
  place: "list-files",
} as const satisfies SwallowedFailurePlace

function recorder() {
  const reported: { place: SwallowedFailurePlace; error: unknown }[] = []
  return {
    reported,
    report: (place: SwallowedFailurePlace, error: unknown) => {
      reported.push({ place, error })
    },
  }
}

describe("foldPortFailure", () => {
  it("投げたら失敗の値を返し、足跡を1件残す", async () => {
    const { reported, report } = recorder()
    const failure = new Error("fictional")

    const read = foldPortFailure(report, PLACE, "failed", (_n: number) =>
      Promise.reject<string>(failure),
    )

    expect(await read(1)).toBe("failed")
    expect(reported).toEqual([{ place: PLACE, error: failure }])
  })

  it("投げなければ値をそのまま返し、足跡は残さない", async () => {
    const { reported, report } = recorder()

    const read = foldPortFailure(report, PLACE, "failed", (n: number) =>
      Promise.resolve(`value-${n}`),
    )

    expect(await read(2)).toBe("value-2")
    expect(reported).toEqual([])
  })
})
