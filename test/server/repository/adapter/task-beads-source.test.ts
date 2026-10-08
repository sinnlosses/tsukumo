import { describe, expect, it } from "vitest"

import type { BeadsOutcome, BeadsStamp } from "../../../../src/server/repository/adapter/beads.ts"
import { createTaskBeadsSource } from "../../../../src/server/repository/adapter/task-beads-source.ts"

describe("createTaskBeadsSource", () => {
  it("bd が failed を返した次の見回りは、印が同じでも bd を打ち直して一覧に戻る", async () => {
    const outcomes: readonly BeadsOutcome[] = [{ kind: "failed" }, { kind: "issues", issues: [] }]
    let calls = 0
    const source = createTaskBeadsSource("/repo", {
      readBeadsIssues: () => Promise.resolve(outcomes[calls++] ?? { kind: "failed" }),
      readBeadsStamp: () => Promise.resolve({ kind: "present", stamp: "same" }),
    })

    expect(await source.read()).toEqual({ kind: "read", result: { kind: "unknown" } })
    expect(await source.read()).toEqual({ kind: "read", result: { kind: "known", items: [] } })
    expect(await source.read()).toEqual({ kind: "unchanged" })
    expect(calls).toBe(2)
  })

  it(".beads が無いと bd を打たずに「Beads なし」を返し、現れたら読み直す", async () => {
    let beadsStamp: BeadsStamp = { kind: "missing" }
    let calls = 0
    const source = createTaskBeadsSource("/repo", {
      readBeadsIssues: () => {
        calls += 1
        return Promise.resolve({ kind: "issues", issues: [] })
      },
      readBeadsStamp: () => Promise.resolve(beadsStamp),
    })

    expect(await source.read()).toEqual({ kind: "read", result: { kind: "no-beads" } })
    expect(calls).toBe(0)
    beadsStamp = { kind: "present", stamp: "same" }
    expect(await source.read()).toEqual({ kind: "read", result: { kind: "known", items: [] } })
    expect(calls).toBe(1)
  })
})
