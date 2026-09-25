import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  readPreviousUsageReview,
  writePreviousUsageReview,
} from "../../../../src/server/usage-review/adapter/previous-usage-review.ts"
import { type UsageReviewFindings } from "../../../../src/shared/usage-review.ts"

// 数も文面もすべて手で書いた架空のもの（会話の実物は使わない。docs/coding-standards.md「会話内容の扱い」）。
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-previous-usage-review-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function path(): string {
  return join(dir, "usage-review.json")
}

const FINDINGS: UsageReviewFindings = {
  days: 7,
  headline: "架空の冒頭の一言。",
  proposals: [
    {
      kind: "session-length",
      target: "",
      impact: "medium",
      title: "架空の見出し",
      basis: "架空の根拠",
      action: "架空のやること",
      followUp: "delegate",
    },
  ],
}

describe("readPreviousUsageReview", () => {
  it("ファイルが無いときは none", () => {
    expect(readPreviousUsageReview(path())).toEqual({ kind: "none" })
  })

  it("版が違うときは none", () => {
    writeFileSync(path(), JSON.stringify({ v: 999, reviewedAt: 1_000, findings: FINDINGS }))
    expect(readPreviousUsageReview(path())).toEqual({ kind: "none" })
  })

  it("形が違う（findings が無い）ときは none", () => {
    writeFileSync(path(), JSON.stringify({ v: 1, reviewedAt: 1_000 }))
    expect(readPreviousUsageReview(path())).toEqual({ kind: "none" })
  })
})

describe("writePreviousUsageReview", () => {
  it("書いた値を読み返せる", () => {
    writePreviousUsageReview(1_000, FINDINGS, path())

    expect(readPreviousUsageReview(path())).toEqual({
      kind: "found",
      reviewedAt: 1_000,
      findings: FINDINGS,
    })
  })

  it("直前の1回だけを持つ（新しい結果が古い結果を置き換える）", () => {
    writePreviousUsageReview(1_000, FINDINGS, path())
    const later: UsageReviewFindings = { ...FINDINGS, headline: "架空の新しい一言。" }
    writePreviousUsageReview(2_000, later, path())

    expect(readPreviousUsageReview(path())).toEqual({
      kind: "found",
      reviewedAt: 2_000,
      findings: later,
    })
  })
})
