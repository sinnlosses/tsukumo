import { statSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { describe, expect, test } from "vitest"

import {
  type ExclusionOptions,
  occupyE2eExclusion,
} from "../../../../scripts/dev/lib/e2e-exclusion-directory.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const STALE_MS = 2000

function shortOptions(): ExclusionOptions {
  return { waitLimitMs: 50, staleMs: STALE_MS, pollMs: 5, notify: () => undefined }
}

describe("occupyE2eExclusion の更新", () => {
  const tempDir = useTempDir("e2e-exclusion-directory-update")
  const directory = () => join(tempDir(), "e2e-full-lock")

  test("持っている間は更新時刻が書き直され、staleMs を超えても奪われない", async () => {
    const startedAt = Temporal.Now.instant().epochMilliseconds
    const first = await occupyE2eExclusion(directory(), shortOptions())
    if (first.kind !== "occupied") {
      throw new Error("占有できなかった")
    }

    await sleep(STALE_MS * 1.5)
    const second = await occupyE2eExclusion(directory(), shortOptions())

    expect(second.kind).toBe("timed-out")
    expect(statSync(directory()).mtimeMs).toBeGreaterThan(startedAt)
    first.release()
  }, 10_000)
})
