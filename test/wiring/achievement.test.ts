import { describe, expect, it } from "vitest"

import { createAchievementCache } from "../../src/server/achievement/adapter/closed-issue.ts"
import type { DiagnosticLog } from "../../src/server/diagnostic/core/diagnostic.ts"
import type { DiagnosticEntry } from "../../src/shared/diagnostic/diagnostic-record.ts"
import { wireAchievement } from "../../src/wiring/achievement.ts"
import { NOOP_CHAT_ARCHIVE } from "../fixture/chat.ts"

function wireWithThrowingClock() {
  const entries: DiagnosticEntry[] = []
  const log: DiagnosticLog = {
    append: (added) => {
      entries.push(...added)
    },
    readRange: () => [],
  }
  // 読みの最初の1回（今日を決める）だけ投げ、足跡の時刻は取れるようにする。
  let calls = 0
  const now = (): number => {
    calls += 1
    if (calls === 1) {
      throw new RangeError("fictional clock failure")
    }
    return 1_000
  }
  const cache = createAchievementCache(
    "/fictional",
    () => 1_000,
    () => Promise.resolve({ kind: "missing" }),
  )
  const { rpc } = wireAchievement(
    {
      cwd: "/fictional",
      now,
      inheritedEnv: {},
      driver: { kind: "sdk" },
      chatArchive: NOOP_CHAT_ARCHIVE,
      throwawayQuery: () => undefined,
    },
    cache,
    log,
  )
  return { rpc, entries }
}

describe("wireAchievement の rpc", () => {
  it("1日ぶんの読みが投げたら unavailable を返し、足跡を残す", async () => {
    const { rpc, entries } = wireWithThrowingClock()

    expect(await rpc.readAchievementDay({ kind: "today" })).toEqual({ kind: "unavailable" })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      flow: "swallowed-failure",
      place: { feature: "achievement", place: "read-day" },
      errorName: "RangeError",
    })
  })

  it("暦の読みが投げたら unavailable を返し、足跡を残す", async () => {
    const { rpc, entries } = wireWithThrowingClock()

    expect(await rpc.readAchievementCalendar()).toEqual({ kind: "unavailable" })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      place: { feature: "achievement", place: "read-calendar" },
    })
  })
})
