import { describe, expect, it } from "vitest"

import type { BeadsOutcome } from "../../../../src/server/repository/adapter/beads.ts"
import { createTaskBeadsSource } from "../../../../src/server/repository/adapter/task-beads-source.ts"

describe("createTaskBeadsSource", () => {
  it("bd が failed を返した次の見回りは、印が同じでも bd を打ち直して一覧に戻る", async () => {
    const outcomes: readonly BeadsOutcome[] = [{ kind: "failed" }, { kind: "issues", issues: [] }]
    let calls = 0
    const source = createTaskBeadsSource("/repo", {
      readBeadsIssues: () => Promise.resolve(outcomes[calls++] ?? { kind: "failed" }),
      readBeadsStamp: () => Promise.resolve("same"),
    })

    expect(await source.read()).toEqual({ kind: "read", result: { kind: "unknown" } })
    expect(await source.read()).toEqual({ kind: "read", result: { kind: "known", items: [] } })
    expect(await source.read()).toEqual({ kind: "unchanged" })
    expect(calls).toBe(2)
  })
})
