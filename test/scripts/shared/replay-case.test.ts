import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { readReplayCase } from "../../../scripts/shared/replay-case.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

const frozenIds = readdirSync(join(REPOSITORY_ROOT, "test/harness-replay"))

describe("readReplayCase", () => {
  test("凍結したタスクの再試集の10件が読め、command は pnpm で始まる", () => {
    expect(frozenIds).toHaveLength(10)
    for (const id of frozenIds) {
      const replayCase = readReplayCase(REPOSITORY_ROOT, id)

      expect(replayCase.id).toBe(id)
      expect(replayCase.command[0]).toBe("pnpm")
      expect(replayCase.checkFiles.length).toBeGreaterThan(0)
    }
  })

  test("無い件は例外", () => {
    expect(() => readReplayCase(REPOSITORY_ROOT, "none")).toThrow(/ENOENT/)
  })
})
