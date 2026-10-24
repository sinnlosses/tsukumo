import { describe, expect, it } from "vitest"
import { z } from "zod"

import { reportShortTypeText } from "../../../../src/server/report/core/short-type-text.ts"
import {
  REPORT_BLOCK_KINDS,
  reportFigureSchema,
  reportSectionSchema,
} from "../../../../src/shared/report/report-block.ts"

describe("reportShortTypeText", () => {
  it("figure と sections の型を、塊の種類を全部含めて型の表記にする", () => {
    const text = reportShortTypeText()

    expect(text).toContain("type ReportFigure = ")
    expect(text).toContain("type ReportSection = ")
    for (const kind of REPORT_BLOCK_KINDS) {
      expect(text).toContain(`kind: "${kind}"`)
    }
  })

  it("欄の説明をそのまま残し、数・字数の制約は出さない", () => {
    const text = reportShortTypeText()

    expect(text).toContain(`// ${reportSectionSchema.shape.heading.description ?? ""}\n`)
    expect(text).toContain("heading?: string")
    expect(text).not.toMatch(/minItems|maxItems/)
  })

  it("JSON Schema のどの位置の description も、`// ` の行として落とさない", () => {
    const text = reportShortTypeText()
    const schema = z.toJSONSchema(
      z.object({ figure: reportFigureSchema, sections: z.array(reportSectionSchema) }),
      { io: "input" },
    )

    const missing = descriptionsIn(schema).filter((description) =>
      description.split("\n").some((line) => !text.includes(`// ${line}\n`)),
    )
    expect(missing).toEqual([])
  })

  it("JSON Schema の骨組みより小さい（説明を全部残して約11.3千字）", () => {
    expect(reportShortTypeText().length).toBeLessThan(11_450)
  })
})

/** 値を再帰で歩き、`description` の文字列を全部集める（位置を問わない）。 */
function descriptionsIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(descriptionsIn)
  }
  if (typeof value !== "object" || value === null) {
    return []
  }
  return Object.entries(value).flatMap(([key, child]) =>
    key === "description" && typeof child === "string" ? [child] : descriptionsIn(child),
  )
}
