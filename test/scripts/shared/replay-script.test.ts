import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { readReplayScript } from "../../../scripts/shared/replay-script.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

const frozenIds = readdirSync(join(REPOSITORY_ROOT, "test/harness-replay"))

describe("readReplayScript", () => {
  test("凍結した再演集の10件の台本が読め、command は pnpm で始まる", () => {
    expect(frozenIds).toHaveLength(10)
    for (const id of frozenIds) {
      const script = readReplayScript(REPOSITORY_ROOT, id)

      expect(script.id).toBe(id)
      expect(script.command[0]).toBe("pnpm")
      expect(script.checkFiles.length).toBeGreaterThan(0)
    }
  })

  test("無い件は例外", () => {
    expect(() => readReplayScript(REPOSITORY_ROOT, "none")).toThrow(/ENOENT/)
  })
})
