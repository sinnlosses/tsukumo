import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createQueryLock } from "../../../src/server/adapter/query-lock.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const KEY = "fictional-key"

const dir = useTempDir("query-lock")

/** 鍵ごとの錠のパス（本物の置き場の代わりに一時ディレクトリの下）。 */
function pathOf(key: string): string {
  return join(dir(), key, "query.lock")
}

describe("createQueryLock", () => {
  const STALE_MS = 240_000
  const LOCKED_AT = Temporal.Instant.from("2026-09-26T00:00:00+09:00")

  function lockPath(): string {
    return pathOf(KEY)
  }

  it("取れるのは1本だけで、外すとまた取れる", () => {
    const first = createQueryLock(pathOf)
    const second = createQueryLock(pathOf)

    const lock = first(KEY, STALE_MS, LOCKED_AT)

    expect(lock).toBeDefined()
    expect(existsSync(lockPath())).toBe(true)
    expect(second(KEY, STALE_MS, LOCKED_AT)).toBeUndefined()

    lock?.release()

    expect(existsSync(lockPath())).toBe(false)
    expect(second(KEY, STALE_MS, LOCKED_AT)).toBeDefined()
  })

  it("書いてから閾値を過ぎた錠は取り直す（過ぎる前は取れない）", () => {
    const lock = createQueryLock(pathOf)
    const now = Temporal.Now.instant()
    expect(lock(KEY, STALE_MS, now)).toBeDefined()

    const justBefore = now.add({ milliseconds: STALE_MS - 1000 })
    expect(lock(KEY, STALE_MS, justBefore)).toBeUndefined()

    const after = now.add({ milliseconds: STALE_MS + 1000 })
    expect(lock(KEY, STALE_MS, after)).toBeDefined()
  })
})
