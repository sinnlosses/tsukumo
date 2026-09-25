import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "../../../../src/server/usage-review/adapter/usage-proposal-dismissal.ts"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-usage-proposal-dismissal-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function path(): string {
  return join(dir, "usage-review-dismissed.json")
}

describe("readDismissedUsageProposalKeys", () => {
  it("ファイルが無いときは空", () => {
    expect(readDismissedUsageProposalKeys(path())).toEqual([])
  })

  it("JSON が壊れているときは空", () => {
    writeFileSync(path(), "{ 壊れた")
    expect(readDismissedUsageProposalKeys(path())).toEqual([])
  })

  it("版が違うときは空", () => {
    writeFileSync(path(), JSON.stringify({ v: 999, keys: ["session-length:"] }))
    expect(readDismissedUsageProposalKeys(path())).toEqual([])
  })
})

describe("writeDismissedUsageProposalKey", () => {
  it("書いた識別子を読み返せる", () => {
    writeDismissedUsageProposalKey("session-length:", path())
    expect(readDismissedUsageProposalKeys(path())).toEqual(["session-length:"])
  })

  it("2件目は末尾に積み重ねる", () => {
    writeDismissedUsageProposalKey("session-length:", path())
    writeDismissedUsageProposalKey("model-choice:sonnet", path())

    expect(readDismissedUsageProposalKeys(path())).toEqual([
      "session-length:",
      "model-choice:sonnet",
    ])
  })

  it("同じ識別子を重ねて書いても1件のまま", () => {
    writeDismissedUsageProposalKey("session-length:", path())
    writeDismissedUsageProposalKey("session-length:", path())

    expect(readDismissedUsageProposalKeys(path())).toEqual(["session-length:"])
  })

  it("ディレクトリが無ければ作って書く", () => {
    const nested = join(dir, "nested", "usage-review-dismissed.json")
    writeDismissedUsageProposalKey("session-length:", nested)
    expect(readDismissedUsageProposalKeys(nested)).toEqual(["session-length:"])
  })

  it("書き込み先がディレクトリで塞がっていても例外を投げない", () => {
    mkdirSync(path())
    expect(() => writeDismissedUsageProposalKey("session-length:", path())).not.toThrow()
  })
})
