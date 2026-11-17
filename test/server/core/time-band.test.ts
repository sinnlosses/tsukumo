import { describe, expect, it } from "vitest"

import { awayBandOf, timeBandOf } from "../../../src/server/core/time-band.ts"

describe("timeBandOf", () => {
  it.each([
    [0, "late-night"],
    [4, "late-night"],
    [5, "morning"],
    [9, "morning"],
    [10, "daytime"],
    [15, "daytime"],
    [16, "evening"],
    [18, "evening"],
    [19, "night"],
    [23, "night"],
  ] as const)("%d 時は %s", (hour, band) => {
    expect(timeBandOf(hour)).toBe(band)
  })
})

describe("awayBandOf", () => {
  it("境目の手前はその帯、境目ちょうどは次の帯", () => {
    const hourMs = 3_600_000
    const boundaries = [
      { belowMs: hourMs, band: "1時間たらず", next: "数時間" },
      { belowMs: 6 * hourMs, band: "数時間", next: "半日から1日" },
      { belowMs: 24 * hourMs, band: "半日から1日", next: "数日" },
      { belowMs: 7 * 24 * hourMs, band: "数日", next: "1週間以上" },
    ]
    for (const { belowMs, band, next } of boundaries) {
      expect(awayBandOf(belowMs - 1)).toBe(band)
      expect(awayBandOf(belowMs)).toBe(next)
    }
  })

  it("0 は最初の帯", () => {
    expect(awayBandOf(0)).toBe("1時間たらず")
  })
})
