import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type { OpenTaskReader } from "../../src/server/token-usage/adapter/tw-claim-list.ts"
import { wireUsageLogs } from "../../src/wiring/usage-log.ts"
import type { WiringDriver } from "../../src/wiring/wiring-context.ts"
import { bundledFakeSession } from "../fixture/bundled-fake-session.ts"
import { contextUsage } from "../fixture/context-usage.ts"
import { reportUsageEntry } from "../fixture/report-usage-entry.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

const home = useTempDir("usage-log-wiring")

const SILENT_DIR_NAMES = ["context-usage", "experience-metric", "report-usage"]
const ALWAYS_DIR_NAMES = ["token-usage", "diagnostic"]

const NO_TASK: OpenTaskReader = { prefetch: () => {}, read: () => undefined }

const FAKE_DRIVER = {
  kind: "fake",
  session: bundledFakeSession(),
  scene: undefined,
  sceneUntil: undefined,
} satisfies WiringDriver

afterEach(() => {
  vi.unstubAllEnvs()
})

function wire(driver: WiringDriver) {
  vi.stubEnv("TSUKUMO_HOME", home())
  return wireUsageLogs({ driver }, { reportSchema: "json-schema", openTask: NO_TASK })
}

async function appendOneOfEach(driver: WiringDriver) {
  const logs = wire(driver)
  const at = Temporal.Instant.from("2026-09-22T09:00:00Z").epochMilliseconds
  const sessionId = "fake-session"
  const noUsage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 }
  const scope = {
    steps: 0,
    tokens: { ...noUsage, cacheCreationInputTokens: 0 },
    tools: [],
  }
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
  logs.tokenUsage.append({
    at,
    sessionId,
    mode: "work",
    models: [
      {
        model: "m",
        ...noUsage,
        thinkingTokens: 0,
        cacheCreationInputTokens: 0,
        costUsd: 0,
      },
    ],
    breakdown: { main: scope, subagent: scope },
  })
  logs.diagnostic.append([{ flow: "session-event", at, generation: 1, kind: "turn-finished" }])
  await logs.closeAll()
}

describe("wireUsageLogs", () => {
  it("疑似セッションのときは3つの使用量の記録のどこにもファイルを作らず、token-usage と diagnostic には書く", async () => {
    await appendOneOfEach(FAKE_DRIVER)

    for (const name of SILENT_DIR_NAMES) {
      expect(existsSync(join(home(), name))).toBe(false)
    }
    for (const name of ALWAYS_DIR_NAMES) {
      expect(existsSync(join(home(), name))).toBe(true)
    }
  })

  it("疑似セッションでないときは5つの記録に書く", async () => {
    await appendOneOfEach({ kind: "sdk" })

    for (const name of [...SILENT_DIR_NAMES, ...ALWAYS_DIR_NAMES]) {
      expect(existsSync(join(home(), name))).toBe(true)
    }
  })

  it("pruneExpired は保持の日数を持つ記録（diagnostic・context-usage・experience-metric）の古い日付のファイルだけを消す", () => {
    const logs = wire({ kind: "sdk" })
    const names = [...SILENT_DIR_NAMES, ...ALWAYS_DIR_NAMES]
    for (const name of names) {
      mkdirSync(join(home(), name), { recursive: true })
      writeFileSync(join(home(), name, "2020-01-01.jsonl"), "")
    }

    logs.pruneExpired("2026-10-05")

    const kept = names.filter((name) => existsSync(join(home(), name, "2020-01-01.jsonl")))
    expect(kept.toSorted()).toEqual(["report-usage", "token-usage"])
  })
})
