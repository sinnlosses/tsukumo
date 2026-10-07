import { describe, expect, it } from "vitest"

import { parseReportTask } from "../../../src/shared/report/report-task.ts"

describe("parseReportTask", () => {
  it("前の記録の終わり方 shipped は finished として読む", () => {
    expect(parseReportTask({ id: "X-7", name: "架空の作業", outcome: "shipped" })).toEqual({
      kind: "task",
      id: "X-7",
      name: "架空の作業",
      outcome: "finished",
    })
  })
})
