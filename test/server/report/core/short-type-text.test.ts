import { describe, expect, it } from "vitest"
import { z } from "zod"

import { reportShortTypeText } from "../../../../src/server/report/core/short-type-text.ts"
import {
  REPORT_BLOCK_KINDS,
  reportFigureSchema,
  reportSectionSchema,
} from "../../../../src/shared/report/report-block.ts"
import { descriptionsIn, missingDescriptions } from "../../../fixture/json-schema-description.ts"

describe("reportShortTypeText", () => {
  it("figure と sections の型を、塊の種類を全部含めて型の表記にする", () => {
    const text = reportShortTypeText()

    expect(text).toContain("type ReportFigure = ")
    expect(text).toContain("type ReportSection = ")
    for (const kind of REPORT_BLOCK_KINDS.filter((known) => known !== "files")) {
      expect(text).toContain(`kind: "${kind}"`)
    }
  })

  it("読み戻し専用の files の塊は書き手向けの型に出さない", () => {
    expect(reportShortTypeText()).not.toContain(`kind: "files"`)
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

    expect(missingDescriptions(descriptionsIn(schema), text)).toEqual([])
  })

  it("JSON Schema の骨組みより小さい（説明を全部残して約12.1千字）", () => {
    expect(reportShortTypeText().length).toBeLessThan(12_150)
  })
})
