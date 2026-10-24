import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { purgeFakeRows } from "../../../scripts/shared/fake-usage-purge.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const dir = useTempDir("fake-usage-purge")

const FAKE = JSON.stringify({ v: 1, sessionId: "fake-session" })
const REAL = JSON.stringify({ v: 1, sessionId: "real-1" })
const MENTION = JSON.stringify({ v: 1, sessionId: "real-2", note: "fake-session" })
const BROKEN = "{ fake-session"

function seed(): string {
  const path = join(dir(), "2026-09-22.jsonl")
  writeFileSync(path, [FAKE, REAL, BROKEN, FAKE, MENTION].join("\n") + "\n")
  return path
}

describe("purgeFakeRows", () => {
  it("--dry-run は疑似の行の件数だけを返し、ファイルを変えない", () => {
    const path = seed()
    const before = readFileSync(path, "utf8")

    expect(purgeFakeRows(dir(), true)).toEqual({ removed: 2, kept: 3 })
    expect(readFileSync(path, "utf8")).toBe(before)
  })

  it("本番は疑似の行だけを消し、他の行と壊れた行を残す", () => {
    const path = seed()

    expect(purgeFakeRows(dir(), false)).toEqual({ removed: 2, kept: 3 })
    expect(readFileSync(path, "utf8")).toBe([REAL, BROKEN, MENTION].join("\n") + "\n")
    expect(readdirSync(dir())).toEqual(["2026-09-22.jsonl"])
  })

  it("置き場が無ければ0件", () => {
    expect(purgeFakeRows(join(dir(), "none"), false)).toEqual({ removed: 0, kept: 0 })
  })
})
