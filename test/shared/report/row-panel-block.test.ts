import { describe, expect, it } from "vitest"

import { reportImagePaths } from "../../../src/server/report/core/report-image-shelf.ts"
import { reportViolations } from "../../../src/server/report/core/report-violation-check.ts"
import {
  parseReportSections,
  type ReportSection,
  reportSectionSchema,
} from "../../../src/shared/report/report-block.ts"
import { leafBlocksOf } from "../../../src/shared/report/row-panel-block.ts"
import { draft } from "../../fixture/report-draft-block.ts"

const text = (value: string): unknown => ({ kind: "text", text: value })
const row = (blocks: readonly unknown[]): unknown => ({ kind: "row", blocks })
const panel = (blocks: readonly unknown[]): unknown => ({
  kind: "panel",
  title: "架空の枠",
  blocks,
})

const sectionsOf = (blocks: readonly unknown[]): readonly ReportSection[] =>
  parseReportSections([{ heading: "", blocks }]).sections

describe("row・panel の受け付け", () => {
  it.each([
    ["子が2個の row", row([text("甲"), text("乙")])],
    ["子が4個の row", row([text("甲"), text("乙"), text("丙"), text("丁")])],
    ["子が1個の panel", panel([text("甲")])],
  ])("%s は節の塊として通る", (_name, block) => {
    expect(reportSectionSchema.safeParse({ blocks: [block] }).success).toBe(true)
  })

  it.each([
    ["子が1個の row", row([text("甲")])],
    ["子が5個の row", row([text("甲"), text("乙"), text("丙"), text("丁"), text("戊")])],
    ["子が無い panel", panel([])],
    ["子に row を入れた row", row([row([text("甲"), text("乙")]), text("丙")])],
    ["子に panel を入れた row", row([panel([text("甲")]), text("乙")])],
    ["子に row を入れた panel", panel([row([text("甲"), text("乙")])])],
    ["子に panel を入れた panel", panel([panel([text("甲")])])],
  ])("%s は差し戻される", (_name, block) => {
    expect(reportSectionSchema.safeParse({ blocks: [block] }).success).toBe(false)
  })

  it("読み戻しは row を子ごと残し、知らない種類に数えない", () => {
    const parsed = parseReportSections([{ heading: "", blocks: [row([text("甲"), text("乙")])] }])

    expect(parsed.unknownBlockCount).toBe(0)
    expect(parsed.sections[0]?.blocks.map((block) => block.kind)).toEqual(["row"])
  })
})

describe("leafBlocksOf", () => {
  it("row・panel の子を書き手の順のまま開き、入力の葉を1つも落とさない", () => {
    const input = [
      text("前"),
      row([text("甲"), { kind: "note", tone: "info", text: "乙" }]),
      panel([{ kind: "code", language: "sh", source: "make" }, text("丙")]),
      text("後"),
    ]
    const blocks = sectionsOf(input)[0]?.blocks ?? []

    expect(leafBlocksOf(blocks).map((block) => block.kind)).toEqual(leafKindsIn(input))
    expect(leafBlocksOf(blocks)).toHaveLength(6)
  })
})

describe("row・panel の子への検査", () => {
  it("row の子の文も、地の文と同じ検査に掛かる", () => {
    const sections = sectionsOf([
      row([text("The quick brown fox jumps over the lazy dog today"), text("架空の一文。")]),
    ])

    expect(reportViolations(draft([], "架空の結論。", sections)).map((v) => v.kind)).toContain(
      "non-japanese",
    )
  })

  it("panel の子の graph も、図の検査に掛かる", () => {
    const sections = sectionsOf([
      panel([{ kind: "graph", direction: "LR", source: "甲 -> 乙\n[]" }]),
    ])

    expect(reportViolations(draft([], "架空の結論。", sections)).map((v) => v.kind)).toContain(
      "broken-graph",
    )
  })

  it("row の子の image も、画像の棚に載せるパスに入る", () => {
    const sections = sectionsOf([
      row([{ kind: "image", path: "架空/画面.png", caption: "架空の画面" }, text("架空の一文。")]),
    ])

    expect(reportImagePaths(sections)).toEqual(["架空/画面.png"])
  })
})

/** 入力の JSON を深さ優先にたどり、`row`・`panel` でない `kind` を出た順に集める。 */
function leafKindsIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(leafKindsIn)
  }
  if (typeof value !== "object" || value === null) {
    return []
  }
  const record = Object.fromEntries(Object.entries(value))
  const kind = record["kind"]
  const own = typeof kind === "string" && kind !== "row" && kind !== "panel" ? [kind] : []
  return [...own, ...leafKindsIn(record["blocks"])]
}
