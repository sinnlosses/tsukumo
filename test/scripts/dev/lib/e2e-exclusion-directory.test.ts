import { existsSync, mkdirSync, utimesSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  type ExclusionOptions,
  occupyE2eExclusion,
} from "../../../../scripts/dev/lib/e2e-exclusion-directory.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const HOUR_MS = 60 * 60_000

function shortOptions(notices: string[]): ExclusionOptions {
  return { waitLimitMs: 50, staleMs: HOUR_MS, pollMs: 5, notify: (line) => notices.push(line) }
}

describe("occupyE2eExclusion", () => {
  const tempDir = useTempDir("e2e-exclusion-directory")
  const directory = () => join(tempDir(), "e2e-full-lock")

  test("占有すると排他制御ディレクトリができ、解放すると消える", async () => {
    const result = await occupyE2eExclusion(directory(), shortOptions([]))

    expect(result.kind).toBe("occupied")
    expect(existsSync(directory())).toBe(true)
    if (result.kind === "occupied") {
      result.release()
    }
    expect(existsSync(directory())).toBe(false)
  })

  test("2回目の解放は、そのあと別の1本が占有したディレクトリを消さない", async () => {
    const first = await occupyE2eExclusion(directory(), shortOptions([]))
    if (first.kind !== "occupied") {
      throw new Error("占有できなかった")
    }
    first.release()
    const second = await occupyE2eExclusion(directory(), shortOptions([]))

    first.release()

    expect(second.kind).toBe("occupied")
    expect(existsSync(directory())).toBe(true)
  })

  test("新しい排他制御ディレクトリがある間は待ち、上限で諦めてディレクトリを消さない", async () => {
    mkdirSync(directory())
    const notices: string[] = []

    const result = await occupyE2eExclusion(directory(), shortOptions(notices))

    expect(result.kind).toBe("timed-out")
    expect(notices.length).toBeGreaterThan(0)
    expect(existsSync(directory())).toBe(true)
  })

  test("古さの閾値より古い排他制御ディレクトリは消して占有する", async () => {
    mkdirSync(directory())
    const twoHoursAgoSeconds = (Temporal.Now.instant().epochMilliseconds - 2 * HOUR_MS) / 1000
    utimesSync(directory(), twoHoursAgoSeconds, twoHoursAgoSeconds)

    const result = await occupyE2eExclusion(directory(), shortOptions([]))

    expect(result.kind).toBe("occupied")
  })
})
