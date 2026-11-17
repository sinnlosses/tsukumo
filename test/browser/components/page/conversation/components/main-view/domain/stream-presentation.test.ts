import { describe, expect, it } from "vitest"

import {
  streamPresentationOf,
  type PresentationContext,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/stream-presentation.ts"

const TIME_ZONE = "Asia/Tokyo"
const MINUTE = 60_000
const BASE = Temporal.ZonedDateTime.from(
  `2026-09-23T09:00:00+09:00[${TIME_ZONE}]`,
).epochMilliseconds

const LIVE: PresentationContext = {
  live: true,
  follow: true,
  pinned: { kind: "none" },
  timeZone: TIME_ZONE,
}

const say = (seconds: number) => ({ kind: "say", at: BASE + seconds * 1000 })

describe("streamPresentationOf の留めたセリフ", () => {
  it("留めた行だけが明るく尾が付き、いまの一言は落ち着く", () => {
    const result = streamPresentationOf([say(0), say(10)], {
      ...LIVE,
      pinned: { kind: "at", index: 0 },
    })
    expect(result.map((row) => row.liveness)).toEqual(["live", "plain"])
    expect(result.map((row) => row.followed)).toEqual([true, false])
    expect(result.map((row) => row.pinned)).toEqual([true, false])
  })

  it("留めた行が並びの外なら、どの行も明るくならず尾も付かない", () => {
    const result = streamPresentationOf([say(0), say(10)], { ...LIVE, pinned: { kind: "outside" } })
    expect(result.map((row) => row.liveness)).toEqual(["plain", "plain"])
    expect(result.map((row) => row.followed)).toEqual([false, false])
    expect(result.map((row) => row.pinned)).toEqual([false, false])
  })
})

describe("streamPresentationOf のいまの一言", () => {
  it("作業中は最新のセリフ1件だけが明るく、尾が付く", () => {
    const result = streamPresentationOf([say(0), { kind: "post", at: BASE }, say(10)], LIVE)
    expect(result.map((row) => row.liveness)).toEqual(["plain", "plain", "live"])
    expect(result.map((row) => row.followed)).toEqual([false, false, true])
  })

  it("すぐ下に全幅の物が続くときも、従っているセリフには尾が付く", () => {
    for (const kind of ["question", "body", "failure", "fold"]) {
      const result = streamPresentationOf([say(0), { kind }], LIVE)
      expect(result[0]?.followed).toBe(true)
    }
  })

  it("やり取りが終わっていれば明るさは無く、いちばん新しいセリフ（締めのセリフ）に尾が付く", () => {
    const result = streamPresentationOf([say(0), say(10)], { ...LIVE, live: false })
    expect(result.map((row) => row.liveness)).toEqual(["plain", "plain"])
    expect(result.map((row) => row.followed)).toEqual([false, true])
  })

  it("定位置の声が従っているあいだは、流れのどのセリフにも尾を付けない", () => {
    const result = streamPresentationOf([say(0), say(10)], { ...LIVE, follow: false })
    expect(result.map((row) => row.followed)).toEqual([false, false])
  })
})

describe("streamPresentationOf の届いたばかりのセリフ", () => {
  const sayAt = (seconds: number, speechIndex: number) => ({ ...say(seconds), speechIndex })
  const items = [sayAt(0, 0), sayAt(10, 1)]
  const arriving = { index: 1, bubble: "swell" } as const

  it("従っている行の位置が届いた位置と同じなら、その行にだけ出方が付く", () => {
    const result = streamPresentationOf(items, { ...LIVE, arriving })
    expect(result.map((row) => row.arrival)).toEqual([undefined, "swell"])
  })

  it("位置が違う行には付かない", () => {
    const result = streamPresentationOf(items, { ...LIVE, arriving: { ...arriving, index: 0 } })
    expect(result.map((row) => row.arrival)).toEqual([undefined, undefined])
  })

  it("定位置の声が従っているあいだ（follow が偽）は付かない", () => {
    const result = streamPresentationOf(items, { ...LIVE, follow: false, arriving })
    expect(result.map((row) => row.arrival)).toEqual([undefined, undefined])
  })

  it("留めているあいだは付かない", () => {
    const result = streamPresentationOf(items, {
      ...LIVE,
      pinned: { kind: "at", index: 1 },
      arriving,
    })
    expect(result.map((row) => row.arrival)).toEqual([undefined, undefined])
  })
})

describe("streamPresentationOf の時刻", () => {
  it("直前に出した行と分が同じ行は見える字で出さない", () => {
    const result = streamPresentationOf(
      [say(0), say(30), say(MINUTE / 1000), say(MINUTE / 1000 + 5)],
      LIVE,
    )
    expect(result.map((row) => row.timeShown)).toEqual([true, false, true, false])
  })

  it("時刻の無い行は分の比べに数えない", () => {
    const result = streamPresentationOf([say(0), { kind: "question" }, say(20)], LIVE)
    expect(result.map((row) => row.timeShown)).toEqual([true, false, false])
  })
})
