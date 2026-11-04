import { describe, expect, it } from "vitest"

import {
  countedSchema,
  hasComparisonOrImageOf,
  PAST_BLOCK_FIELDS,
  PAST_BLOCK_KINDS,
  recordSchema,
  rejectionSchema,
} from "../../../scripts/runtime/report-usage-row.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../../../src/server/report/core/usage/report-usage-record.ts"

describe("集計が読む記録の形", () => {
  const acceptedRow = {
    at: "2026-09-22T09:00:00+09:00",
    sessionId: "claude-session-1",
    driver: "sdk",
    figureKind: "none",
    noneReason: "short-answer",
    sectionShapeTags: [],
    sectionBlockKinds: [],
    forbiddenShapeSectionCount: 0,
    forbiddenShapeBlocks: [],
    blockKinds: ["text"],
    blockFields: [],
    notations: [],
    containedNotations: [],
    escapeNotations: [],
    unknownBlockCount: 0,
    listStyles: [],
    mermaidKinds: [],
    componentNames: ["Section", "Markdown"],
    markdownNotationKinds: ["quote"],
    hasModifiedFiles: false,
    hasComparisonOrImage: false,
    forTask: false,
    hasFigure: false,
    readImageWithoutImageBlock: false,
    emphasisCount: 0,
    graphEdgeCount: 0,
    graphUnlabeledEdgeCount: 0,
    graphNodeCount: 0,
    hasUnverifiedCheck: false,
    hasHowToVerify: false,
    taskGenre: "none",
    taskOutcome: "none",
    hasFavor: false,
    hasSourceReference: false,
    shortTable: false,
    argumentChars: { total: 0, fields: {} },
    inheritedFields: [],
  }

  it("版24の行(部品の名前の欄がある)は読め、版23の行は読まない", () => {
    const current = recordSchema.safeParse({ v: REPORT_USAGE_FORMAT_VERSION, ...acceptedRow })
    const old = recordSchema.safeParse({ v: 23, ...acceptedRow })

    expect(current.success).toBe(true)
    expect(current.success && current.data.componentNames).toEqual(["Section", "Markdown"])
    expect(old.success).toBe(false)
  })

  it("版24までの行の旧い欄の名前（hasBeforeAfterOrImage）と塊の種類（beforeAfter）も、別の名前のまま読める", () => {
    const { hasComparisonOrImage: _renamed, ...rest } = acceptedRow
    const past = recordSchema.safeParse({
      v: 24,
      ...rest,
      hasBeforeAfterOrImage: true,
      blockKinds: ["beforeAfter"],
      blockFields: ["beforeAfterRegion"],
    })

    expect(past.success).toBe(true)
    expect(past.success && hasComparisonOrImageOf(past.data)).toBe(true)
    expect(past.success && past.data.blockKinds).toEqual(["beforeAfter"])
    expect(PAST_BLOCK_KINDS).toEqual(["beforeAfter"])
    expect(PAST_BLOCK_FIELDS).toEqual(["beforeAfterRegion"])
  })

  it("直後の依頼の行(followed)は、どの形にも当たらず読み飛ばされる", () => {
    const followed = {
      v: REPORT_USAGE_FORMAT_VERSION,
      kind: "followed",
      at: "2026-09-22T09:05:00+09:00",
      sessionId: "claude-session-1",
      driver: "sdk",
      restated: true,
    }

    expect(recordSchema.safeParse(followed).success).toBe(false)
    expect(rejectionSchema.safeParse(followed).success).toBe(false)
    expect(countedSchema.safeParse(followed).success).toBe(false)
  })
})
