import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createChatConsolidationLock } from "../../../../src/server/chat/adapter/chat-consolidation-lock.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PACK = characterPackName("fictional-pack")

const dir = useTempDir("chat-consolidation-lock")

/** 書き込み先の親（本物の `~/.tsukumo/chat-archive` の代わり）。 */
function root(): string {
  return join(dir(), "chat-archive")
}

describe("createChatConsolidationLock", () => {
  const STALE_MS = 240_000
  const LOCKED_AT = Temporal.Instant.from("2026-09-26T00:00:00+09:00")

  function lockPath(): string {
    return join(root(), PACK, "consolidation.lock")
  }

  it("取れるのは1本だけで、外すとまた取れる", () => {
    const first = createChatConsolidationLock(root())
    const second = createChatConsolidationLock(root())

    const lock = first(PACK, STALE_MS, LOCKED_AT)

    expect(lock).toBeDefined()
    expect(existsSync(lockPath())).toBe(true)
    expect(second(PACK, STALE_MS, LOCKED_AT)).toBeUndefined()

    lock?.release()

    expect(existsSync(lockPath())).toBe(false)
    expect(second(PACK, STALE_MS, LOCKED_AT)).toBeDefined()
  })

  it("書いてから閾値を過ぎた錠は取り直す（過ぎる前は取れない）", () => {
    const lockConsolidation = createChatConsolidationLock(root())
    const now = Temporal.Now.instant()
    expect(lockConsolidation(PACK, STALE_MS, now)).toBeDefined()

    const justBefore = now.add({ milliseconds: STALE_MS - 1000 })
    expect(lockConsolidation(PACK, STALE_MS, justBefore)).toBeUndefined()

    const after = now.add({ milliseconds: STALE_MS + 1000 })
    expect(lockConsolidation(PACK, STALE_MS, after)).toBeDefined()
  })
})
