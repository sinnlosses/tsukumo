import { describe, expect, it } from "vitest"

import {
  countedSchema,
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
    hasBeforeAfterOrImage: false,
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
