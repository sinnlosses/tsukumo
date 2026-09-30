import { describe, expect, it } from "vitest"

import { episodeIdCounters } from "../../../../src/server/chat/core/chat-episode-id.ts"

describe("episodeIdCounters", () => {
  it("日付ごとに最大の通し番号を返し、形の合わない id は数えない", () => {
    const counters = episodeIdCounters([
      { id: "2026-09-01-1" },
      { id: "2026-09-01-3" },
      { id: "2026-09-02-2" },
      { id: "broken" },
    ])

    expect([...counters]).toEqual([
      ["2026-09-01", 3],
      ["2026-09-02", 2],
    ])
  })
})
