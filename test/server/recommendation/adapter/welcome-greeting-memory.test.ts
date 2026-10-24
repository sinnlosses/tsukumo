import { existsSync, writeFileSync } from "node:fs"
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

    writeRecentWelcomeGreetings("架空", recent, path)

    expect(readRecentWelcomeGreetings("架空", path)).toEqual(recent)
  })

  it("無い・壊れている・版が違うときは空", () => {
    const path = join(tempDir(), "welcome-greeting.json")
    expect(readRecentWelcomeGreetings("架空", path)).toEqual([])

    writeFileSync(path, "{")
    expect(readRecentWelcomeGreetings("架空", path)).toEqual([])

    writeFileSync(path, JSON.stringify({ v: 999, recent: [] }))
    expect(readRecentWelcomeGreetings("架空", path)).toEqual([])
  })

  it("キャラごとに別のファイルで、互いの直近を読まない", () => {
    const first = [{ withCard: "架空のボクの {札}", withoutCard: "架空のボクの" }]
    const second = [{ withCard: "架空のわたしの {札}", withoutCard: "架空のわたしの" }]

    writeRecentWelcomeGreetings("per-char-a", first)
    writeRecentWelcomeGreetings("per-char-b", second)

    expect(readRecentWelcomeGreetings("per-char-a")).toEqual(first)
    expect(readRecentWelcomeGreetings("per-char-b")).toEqual(second)
  })

  it.each(["", ".", "..", "../escape", "a/b", "a\\b"])(
    "パスの外へ出る名前 %j は、読みは空で書きは何もしない",
    (name) => {
      const path = join(tempDir(), "written.json")
      const recent = [{ withCard: "架空の {札}", withoutCard: "架空の" }]
      writeFileSync(path, JSON.stringify({ v: 1, recent }))

      expect(readRecentWelcomeGreetings(name, path)).toEqual([])

      const target = join(tempDir(), "target.json")
      writeRecentWelcomeGreetings(name, recent, target)
      expect(existsSync(target)).toBe(false)
    },
  )
})
