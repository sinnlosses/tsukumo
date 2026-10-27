import { describe, expect, it } from "vitest"

import { parseReportSections, type ReportSection } from "../../../src/shared/report/report-block.ts"
import { reportSectionsMarkdown } from "../../../src/shared/report/report-markdown.ts"
import { captionNumbers, NO_IMAGES } from "../../fixture/report-markdown.ts"

const text = (value: string, aside = ""): unknown => ({ kind: "text", text: value, aside })
const table = (title: string): unknown => ({
  kind: "table",
  title,
  columns: ["項目", "値"],
  rows: [["架空の甲", "1"]],
})
const graph: unknown = { kind: "graph", direction: "LR", title: "架空の図", source: "甲 -> 乙" }

const sectionsOf = (
  ...blocksBySection: readonly (readonly unknown[])[]
): readonly ReportSection[] =>
  parseReportSections(
    blocksBySection.map((blocks, index) => ({ heading: `架空の節${String(index)}`, blocks })),
  ).sections

describe("row・panel の Markdown", () => {
  it("row は子ごとの区画を容れ物に並べ、panel は題の行と子を枠に入れる", () => {
    const markdown = reportSectionsMarkdown(
      sectionsOf([
        { kind: "row", blocks: [text("架空の甲"), text("架空の乙")] },
        { kind: "panel", title: "架空の枠の題", blocks: [text("架空の丙")] },
      ]),
      NO_IMAGES,
    )

    expect(markdown.match(/<div class="block-row-cell">/g)).toHaveLength(2)
    expect(markdown).toContain('<div class="block-row">')
    expect(markdown).toContain('<div class="block-panel">\n\n<div class="block-panel-title">')
    expect(markdown).toContain("架空の枠の題")
  })

  it("子の題つきの部品は、節をまたいだ通しの番号を子の順に受け取る", () => {
    const sections = sectionsOf(
      [table("架空の前の表")],
      [{ kind: "row", blocks: [table("架空の右の表"), graph] }, table("架空の後の表")],
    )

    expect(captionNumbers(sections)).toEqual(["表 1", "表 2", "図 1", "表 3"])
  })

  it("子と親の aside は、容れ物の傍注にまとめる", () => {
    const markdown = reportSectionsMarkdown(
      sectionsOf([
        {
          kind: "row",
          aside: "架空の親の傍注",
          blocks: [text("架空の甲", "架空の子の傍注"), text("架空の乙")],
        },
      ]),
      NO_IMAGES,
    )

    expect(markdown.indexOf('<div class="with-gutter">')).toBeLessThan(
      markdown.indexOf('<div class="block-row">'),
    )
    expect(markdown.indexOf("架空の子の傍注")).toBeLessThan(markdown.indexOf("架空の親の傍注"))
    expect(markdown.indexOf('<div class="block-row">')).toBeLessThan(
      markdown.indexOf("架空の子の傍注"),
    )
  })

  it("親の fold は容れ物ごと畳む", () => {
    const markdown = reportSectionsMarkdown(
      sectionsOf([
        { kind: "row", fold: "架空の畳み", blocks: [text("架空の甲"), text("架空の乙")] },
      ]),
      NO_IMAGES,
    )

    expect(markdown).toMatch(
      /^## [^\n]+\n\n<details><summary>架空の畳み<\/summary>\n\n<div class="block-row">/,
    )
  })
})
