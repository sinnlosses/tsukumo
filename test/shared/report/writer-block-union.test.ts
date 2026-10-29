import { describe, expect, it } from "vitest"

import {
  namedWriterBlockSchema,
  parseReportBlocks,
} from "../../../src/shared/report/report-block.ts"
import { reportRetrospectiveSchema } from "../../../src/shared/report/report-retrospective.ts"

describe("書き手向けの塊の合併", () => {
  const files = {
    kind: "files",
    items: [{ path: "架空/a.ts", change: "modified" }],
    title: "",
    fold: "",
    aside: "",
  }

  it("files の塊は書き手向けの schema では受けず、旧い記録の読み戻しでは通す", () => {
    expect(namedWriterBlockSchema.safeParse(files).success).toBe(false)
    expect(reportRetrospectiveSchema.safeParse({ summary: "架空", blocks: [files] }).success).toBe(
      false,
    )
    expect(parseReportBlocks([files]).map((block) => block.kind)).toEqual(["files"])
  })
})
