import { describe, expect, it } from "vitest"

import { localDateEpochRange, localTimeHHMM } from "../../../src/server/adapter/local-time.ts"

describe("localDateEpochRange", () => {
  it("終わりは次の日の始まりと一致する", () => {
    const today = localDateEpochRange("2026-09-23")
    const tomorrow = localDateEpochRange("2026-09-24")

    expect(today.endEpochMilliseconds).toBe(tomorrow.startEpochMilliseconds)
  })
})

describe("localTimeHHMM", () => {
  // ホストの実際のタイムゾーンを決め打たない（`Temporal.Now.timeZoneId()` を経由する
  // `localDateEpochRange` からの相対で確かめる。単体テストの設定がプロセスの `TZ` を `UTC` に固定する
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
