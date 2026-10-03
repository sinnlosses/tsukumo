import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  readRecentWelcomeGreetings,
  writeRecentWelcomeGreetings,
} from "../../../../src/server/recommendation/adapter/welcome-greeting-memory.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const tempDir = useTempDir("welcome-greeting")

describe("直近の迎えの挨拶", () => {
  it("書いた順のまま読み戻せる", () => {
    const path = join(tempDir(), "welcome-greeting.json")
    const recent = [
      { withCard: "架空の新しい {札}", withoutCard: "架空の新しい" },
      { withCard: "架空の古い {札}", withoutCard: "架空の古い" },
    ]

    writeRecentWelcomeGreetings(recent, path)

    expect(readRecentWelcomeGreetings(path)).toEqual(recent)
  })

  it("無い・壊れている・版が違うときは空", () => {
    const path = join(tempDir(), "welcome-greeting.json")
    expect(readRecentWelcomeGreetings(path)).toEqual([])

    writeFileSync(path, "{")
    expect(readRecentWelcomeGreetings(path)).toEqual([])

    writeFileSync(path, JSON.stringify({ v: 999, recent: [] }))
    expect(readRecentWelcomeGreetings(path)).toEqual([])
  })
})
