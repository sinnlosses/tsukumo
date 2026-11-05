import { describe, expect, it } from "vitest"

import {
  a2uiReportComponentSchema,
  REPORT_COMPONENT_SCHEMAS,
} from "../../../src/shared/report/a2ui-report-catalog.ts"
import { PART_EXAMPLES } from "../../../src/shared/report/part-example-list.ts"

function writtenSchemaOf(component: unknown) {
  return Object.entries(REPORT_COMPONENT_SCHEMAS).find(([name]) => name === component)?.[1]
}

describe("PART_EXAMPLES", () => {
  it("部品の名前の集合が REPORT_COMPONENT_SCHEMAS と一致し、どの例も部品の受理の形を通る", () => {
    expect(Object.keys(PART_EXAMPLES).toSorted()).toEqual(
      Object.keys(REPORT_COMPONENT_SCHEMAS).toSorted(),
    )
    const rejected = Object.entries(PART_EXAMPLES).flatMap(([name, parts]) =>
      parts
        .filter((part) => writtenSchemaOf(part.component)?.safeParse(part).success !== true)
        .map(() => name),
    )
    expect(rejected).toEqual([])
  })

  it("受理されない部品は検査が拒む", () => {
    expect(a2uiReportComponentSchema.safeParse({ id: "p1", component: "Paragraph" }).success).toBe(
      false,
    )
  })
})
