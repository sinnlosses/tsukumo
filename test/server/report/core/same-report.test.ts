import { describe, expect, it } from "vitest"
import { z } from "zod"

import { isSameReport } from "../../../../src/server/report/core/same-report.ts"
import { a2uiReportComponentSchema } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import { A2UI_ROOT_ID } from "../../../../src/shared/report/a2ui-report-outline.ts"
import type { ReportBlockSection } from "../../../../src/shared/report/report-block.ts"
import { reportDraft, reportOfDrawn } from "../../../fixture/report-event.ts"

const sectionsOf = (
  heading: string,
  ...texts: readonly string[]
): readonly ReportBlockSection[] => [
  {
    heading,
    blocks: texts.map((markdown) => ({ kind: "markdown" as const, markdown, fold: "", aside: "" })),
  },
]

const drawnOf = (sections: readonly ReportBlockSection[]) =>
  reportOfDrawn({ conclusion: "架空の結論。", sections })

const draftOf = (sections: readonly ReportBlockSection[]) =>
  reportDraft({ conclusion: "架空の結論。", sections })

describe("isSameReport", () => {
  const sections = sectionsOf("架空の見出し", "架空の一つ目。", "架空の二つ目。")

  it("同じ中身は同じと判定する", () => {
    expect(isSameReport(drawnOf(sections), draftOf(sections))).toBe(true)
  })

  it("部品の ID の付け替えだけの違いは同じと判定する", () => {
    const draft = draftOf(sections)
    const ids = new Set(draft.components.map((part) => part.id).filter((id) => id !== A2UI_ROOT_ID))
    const renamed = {
      ...draft,
      components: z
        .array(a2uiReportComponentSchema)
        .parse(
          JSON.parse(JSON.stringify(draft.components), (_key, value: unknown) =>
            typeof value === "string" && ids.has(value) ? `renamed-${value}` : value,
          ),
        ),
    }

    expect(isSameReport(drawnOf(sections), renamed)).toBe(true)
  })

  it.each([
    ["葉の中身が違う", sectionsOf("架空の見出し", "架空の一つ目。", "別の二つ目。")],
    ["葉の並びが違う", sectionsOf("架空の見出し", "架空の二つ目。", "架空の一つ目。")],
    ["節の見出しが違う", sectionsOf("別の見出し", "架空の一つ目。", "架空の二つ目。")],
    ["葉が足りない", sectionsOf("架空の見出し", "架空の一つ目。")],
  ])("%s なら違うと判定する", (_name, other) => {
    expect(isSameReport(drawnOf(sections), draftOf(other))).toBe(false)
  })

  it("図の記録が違えば違うと判定する", () => {
    const withFigure = reportDraft({
      conclusion: "架空の結論。",
      sections,
      figure: { kind: "none", reason: "short-answer" },
    })

    expect(isSameReport(drawnOf(sections), withFigure)).toBe(false)
  })
})
