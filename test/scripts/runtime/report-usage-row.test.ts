import { describe, expect, it } from "vitest"

import {
  countedSchema,
  recordSchema,
  rejectionSchema,
} from "../../../scripts/runtime/report-usage-row.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../../../src/server/report/core/report-usage-record.ts"

describe("集計が読む記録の形", () => {
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
