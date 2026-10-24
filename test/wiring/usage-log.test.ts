import { existsSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { wireUsageLogs } from "../../src/wiring/usage-log.ts"
import { bundledFakeSession } from "../fixture/bundled-fake-session.ts"
import { contextUsage } from "../fixture/context-usage.ts"
import { reportUsageEntry } from "../fixture/report-usage-entry.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

const home = useTempDir("usage-log-wiring")

const USAGE_DIR_NAMES = ["context-usage", "experience-metric", "report-usage"]

afterEach(() => {
  vi.unstubAllEnvs()
})

async function appendOneOfEach(fakeSession: ReturnType<typeof bundledFakeSession> | undefined) {
  vi.stubEnv("TSUKUMO_HOME", home())
  const logs = wireUsageLogs({ fakeSession }, "json-schema")
  const at = Temporal.Instant.from("2026-09-22T09:00:00Z").epochMilliseconds
  const sessionId = "fake-session"
  logs.context.append({ at, sessionId, mode: "work", usage: contextUsage() })
  logs.experienceMetric.append({
    at,
    sessionId,
    kind: "conclusion",
    moment: "deliver",
    untilConclusionMs: 1000,
    askingMs: 0,
    askCount: 0,
  })
  logs.report.append(reportUsageEntry(at, sessionId))
  await logs.closeAll()
}

describe("wireUsageLogs", () => {
  it("疑似セッションのときは3つの記録のどこにもファイルを作らない", async () => {
    await appendOneOfEach(bundledFakeSession())

    for (const name of USAGE_DIR_NAMES) {
      expect(existsSync(join(home(), name))).toBe(false)
    }
  })

  it("疑似セッションでないときは3つの記録に書く", async () => {
    await appendOneOfEach(undefined)

    for (const name of USAGE_DIR_NAMES) {
      expect(existsSync(join(home(), name))).toBe(true)
    }
  })
})
