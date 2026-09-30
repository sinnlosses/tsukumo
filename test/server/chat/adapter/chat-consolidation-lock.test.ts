import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createChatConsolidationLock } from "../../../../src/server/chat/adapter/chat-consolidation-lock.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("chat-consolidation-lock")

/** 書き込み先の親（本物の `~/.tsukumo/chat-archive` の代わり）。 */
function root(): string {
  return join(dir(), "chat-archive")
}

describe("createChatConsolidationLock", () => {
  const STALE_MS = 240_000
  const LOCKED_AT = Temporal.Instant.from("2026-09-26T00:00:00+09:00")

  function lockPath(): string {
    return join(root(), "fictional-pack", "consolidation.lock")
  }

  it("取れるのは1本だけで、外すとまた取れる", () => {
    const first = createChatConsolidationLock(root())
    const second = createChatConsolidationLock(root())

    const lock = first("fictional-pack", STALE_MS, LOCKED_AT)

    expect(lock).toBeDefined()
    expect(existsSync(lockPath())).toBe(true)
    expect(second("fictional-pack", STALE_MS, LOCKED_AT)).toBeUndefined()

    lock?.release()

    expect(existsSync(lockPath())).toBe(false)
    expect(second("fictional-pack", STALE_MS, LOCKED_AT)).toBeDefined()
  })

  it("書いてから閾値を過ぎた錠は取り直す（過ぎる前は取れない）", () => {
    const lockConsolidation = createChatConsolidationLock(root())
    const now = Temporal.Now.instant()
    expect(lockConsolidation("fictional-pack", STALE_MS, now)).toBeDefined()

    const justBefore = now.add({ milliseconds: STALE_MS - 1000 })
    expect(lockConsolidation("fictional-pack", STALE_MS, justBefore)).toBeUndefined()

    const after = now.add({ milliseconds: STALE_MS + 1000 })
    expect(lockConsolidation("fictional-pack", STALE_MS, after)).toBeDefined()
  })

  it("パック名が名前として通らないときは取れず、ファイルも作らない", () => {
    const lockConsolidation = createChatConsolidationLock(root())

    expect(lockConsolidation("../evil", STALE_MS, LOCKED_AT)).toBeUndefined()
    expect(existsSync(root())).toBe(false)
  })
})
