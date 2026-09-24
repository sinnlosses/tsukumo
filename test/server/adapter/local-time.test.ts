import { describe, expect, it } from "bun:test"

import { localDateEpochRange, localTimeHHMM } from "../../../src/server/adapter/local-time.ts"

describe("localDateEpochRange", () => {
  it("始まりと終わり（次の日の始まり）がちょうど24時間離れている", () => {
    const range = localDateEpochRange("2026-09-23")

    expect(range.endEpochMilliseconds - range.startEpochMilliseconds).toBe(24 * 60 * 60 * 1000)
  })

  it("終わりは次の日の始まりと一致する", () => {
    const today = localDateEpochRange("2026-09-23")
    const tomorrow = localDateEpochRange("2026-09-24")

    expect(today.endEpochMilliseconds).toBe(tomorrow.startEpochMilliseconds)
  })
})

describe("localTimeHHMM", () => {
  // ホストの実際のタイムゾーンを決め打たない（`Temporal.Now.timeZoneId()` を経由する
  // `localDateEpochRange` からの相対で確かめる。`bun test` はプロセスの `TZ` を `UTC` にする
  // ため、`+09:00` などを決め打つとホストの実際の TZ とずれる）。
  it("日の始まりは 00:00", () => {
    const range = localDateEpochRange("2026-09-23")

    expect(localTimeHHMM(range.startEpochMilliseconds)).toBe("00:00")
  })

  it("日の始まりから1時間30分後は 01:30", () => {
    const range = localDateEpochRange("2026-09-23")

    expect(localTimeHHMM(range.startEpochMilliseconds + (1 * 60 + 30) * 60 * 1000)).toBe("01:30")
  })

  it("秒は出さず分までで切り捨てる", () => {
    const range = localDateEpochRange("2026-09-23")

    expect(localTimeHHMM(range.startEpochMilliseconds + 9 * 60 * 1000 + 59 * 1000)).toBe("00:09")
  })
})
