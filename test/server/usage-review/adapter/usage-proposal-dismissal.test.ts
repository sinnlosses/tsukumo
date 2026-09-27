import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "../../../../src/server/usage-review/adapter/usage-proposal-dismissal.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("usage-proposal-dismissal")

function path(): string {
  return join(dir(), "usage-review-dismissed.json")
}

describe("readDismissedUsageProposalKeys", () => {
  it("ファイルが無いときは空", () => {
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
})
