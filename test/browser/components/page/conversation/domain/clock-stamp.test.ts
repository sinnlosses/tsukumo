import { describe, expect, it } from "vitest"

import {
  recordClockStamp,
  recordClockStampWithDay,
} from "../../../../../../src/browser/components/page/conversation/domain/clock-stamp.ts"

const TIME_ZONE = "Asia/Tokyo"
const EPOCH_MILLISECONDS = Temporal.ZonedDateTime.from(
  `2026-09-23T09:05:30+09:00[${TIME_ZONE}]`,
).epochMilliseconds

describe("recordClockStamp", () => {
  it("stamped と recovered は HH:MM と dateTime にする", () => {
    const expected = { kind: "known", dateTime: "2026-09-23T09:05+09:00", text: "09:05" }
    expect(recordClockStamp({ kind: "stamped", at: EPOCH_MILLISECONDS }, TIME_ZONE)).toEqual(
      expected,
    )
    expect(recordClockStamp({ kind: "recovered", at: EPOCH_MILLISECONDS }, TIME_ZONE)).toEqual(
      expected,
    )
  })

  it("restored は unknown にする", () => {
    expect(recordClockStamp({ kind: "restored" }, TIME_ZONE)).toEqual({ kind: "unknown" })
  })
})

describe("recordClockStampWithDay（読む人のタイムゾーンで日を比べる）", () => {
  const localEpoch = (isoLocal: string): number =>
    Temporal.PlainDateTime.from(isoLocal).toZonedDateTime(Temporal.Now.timeZoneId())
      .epochMilliseconds
  const time = { kind: "stamped", at: localEpoch("2026-09-23T09:05:30") } as const

  it("いまと同じ日なら HH:MM だけ", () => {
    const stamp = recordClockStampWithDay(time, localEpoch("2026-09-23T20:00:00"))
    expect(stamp.kind === "known" ? stamp.text : undefined).toBe("09:05")
  })

  it("別の日なら M/D HH:MM にする", () => {
    const stamp = recordClockStampWithDay(time, localEpoch("2026-09-24T08:00:00"))
    expect(stamp.kind === "known" ? stamp.text : undefined).toBe("9/23 09:05")
  })

  it("restored は unknown のまま", () => {
    expect(recordClockStampWithDay({ kind: "restored" }, time.at)).toEqual({ kind: "unknown" })
  })
})
