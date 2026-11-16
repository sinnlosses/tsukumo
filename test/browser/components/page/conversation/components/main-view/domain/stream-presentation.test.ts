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
  asking: false,
  hasDraft: false,
  timeZone: TIME_ZONE,
}

const say = (seconds: number) => ({ kind: "say", at: BASE + seconds * 1000 })

describe("streamPresentationOf のいまの一言", () => {
  it("作業中は最新のセリフ1件だけが明るく、尾が付く", () => {
    const result = streamPresentationOf([say(0), { kind: "post", at: BASE }, say(10)], LIVE)
    expect(result.map((row) => row.liveness)).toEqual(["plain", "plain", "live-with-tail"])
  })

  it("すぐ下に全幅の物が続くときは尾を出さない", () => {
    for (const kind of ["question", "body", "failure", "fold"]) {
      const result = streamPresentationOf([say(0), { kind }], LIVE)
      expect(result[0]?.liveness).toBe("live")
    }
  })

  it("全幅でない物が続くなら尾を出す", () => {
    expect(streamPresentationOf([say(0), { kind: "post", at: BASE }], LIVE)[0]?.liveness).toBe(
      "live-with-tail",
    )
  })

  it("末尾のセリフは、答え待ちか書きかけの紙が続くとき尾を出さない", () => {
    expect(streamPresentationOf([say(0)], { ...LIVE, asking: true })[0]?.liveness).toBe("live")
    expect(streamPresentationOf([say(0)], { ...LIVE, hasDraft: true })[0]?.liveness).toBe("live")
  })

  it("やり取りが終わっていれば、いまの一言は無い", () => {
    const result = streamPresentationOf([say(0), say(10)], { ...LIVE, live: false })
    expect(result.map((row) => row.liveness)).toEqual(["plain", "plain"])
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
