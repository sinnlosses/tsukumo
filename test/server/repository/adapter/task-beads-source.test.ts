import { describe, expect, it } from "vitest"

import type { BeadsOutcome, BeadsStamp } from "../../../../src/server/repository/adapter/beads.ts"
import { createTaskBeadsSource } from "../../../../src/server/repository/adapter/task-beads-source.ts"

/** 印が動かなくても読み直す間隔（`BEADS_REREAD_INTERVAL_MS`）。 */
const REREAD_INTERVAL_MS = 60_000

const EMPTY_LIST = {
  kind: "read",
  result: { kind: "known", items: [], omittedClosedCount: 0 },
}

describe("createTaskBeadsSource", () => {
  it("bd が failed を返した次の見回りは、印が同じでも bd を打ち直して一覧に戻る", async () => {
    const outcomes: readonly BeadsOutcome[] = [{ kind: "failed" }, { kind: "issues", issues: [] }]
    let calls = 0
    const source = createTaskBeadsSource("/repo", {
      readBeadsIssues: () => Promise.resolve(outcomes[calls++] ?? { kind: "failed" }),
      readBeadsStamp: () => Promise.resolve({ kind: "present", stamp: "same" }),
      now: () => 0,
    })

    expect(await source.read()).toEqual({ kind: "read", result: { kind: "unknown" } })
    expect(await source.read()).toEqual(EMPTY_LIST)
    expect(await source.read()).toEqual({ kind: "unchanged" })
    expect(calls).toBe(2)
  })

  it("読む前に取った印を bd の読みへ渡す", async () => {
    const stamps: (string | undefined)[] = []
    const source = createTaskBeadsSource("/repo", {
      readBeadsIssues: (_cwd, stamp) => {
        stamps.push(stamp)
        return Promise.resolve({ kind: "issues", issues: [] })
      },
      readBeadsStamp: () => Promise.resolve({ kind: "present", stamp: "s1" }),
      now: () => 0,
    })

    await source.read()

    expect(stamps).toEqual(["s1"])
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
      now: () => 0,
    })

    expect(await source.read()).toEqual({ kind: "read", result: { kind: "no-beads" } })
    expect(calls).toBe(0)
    beadsStamp = { kind: "present", stamp: "same" }
    expect(await source.read()).toEqual(EMPTY_LIST)
    expect(calls).toBe(1)
  })

  describe("印が動かないときの読み直し", () => {
    function startWithStamp(stamp: string | undefined) {
      let now = 0
      const stamps: (string | undefined)[] = []
      const source = createTaskBeadsSource("/repo", {
        readBeadsIssues: (_cwd, passed) => {
          stamps.push(passed)
          return Promise.resolve({ kind: "issues", issues: [] })
        },
        readBeadsStamp: () => Promise.resolve({ kind: "present", stamp }),
        now: () => now,
      })
      return {
        source,
        stamps,
        advance: (ms: number) => {
          now += ms
        },
      }
    }

    it("間隔が過ぎる前は読まない", async () => {
      const { source, stamps, advance } = startWithStamp("same")

      await source.read()
      advance(REREAD_INTERVAL_MS - 1)

      expect(await source.read()).toEqual({ kind: "unchanged" })
      expect(stamps).toEqual(["same"])
    })

    it("間隔が過ぎたら、印を渡さずに読み直し、そこから次の間隔を数える", async () => {
      const { source, stamps, advance } = startWithStamp("same")

      await source.read()
      advance(REREAD_INTERVAL_MS)
      expect(await source.read()).toEqual(EMPTY_LIST)
      advance(REREAD_INTERVAL_MS - 1)
      expect(await source.read()).toEqual({ kind: "unchanged" })

      expect(stamps).toEqual(["same", undefined])
    })

    it("時計が戻ったときも読み直す", async () => {
      const { source, stamps, advance } = startWithStamp("same")

      await source.read()
      advance(-1)

      expect(await source.read()).toEqual(EMPTY_LIST)
      expect(stamps).toEqual(["same", undefined])
    })

    it("印が取れないときは、間隔によらず毎回読む", async () => {
      const { source, stamps } = startWithStamp(undefined)

      await source.read()
      await source.read()
      await source.read()

      expect(stamps).toEqual([undefined, undefined, undefined])
    })
  })
})
