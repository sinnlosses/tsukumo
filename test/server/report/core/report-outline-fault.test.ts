import { describe, expect, it } from "vitest"
import { z } from "zod"

import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import { a2uiReportComponentSchema } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import { plotBlockSchema } from "../../../../src/shared/report/figure-grammar.ts"
import type { SectionBlock } from "../../../../src/shared/report/report-block.ts"
import { reportDraft } from "../../../fixture/report-event.ts"

// 部品の一覧（`components`）を直接入力にして、配置の部品の中の葉も同じ検査にかかることを確かめる。

const parts = (...raw: readonly Record<string, unknown>[]) =>
  z.array(a2uiReportComponentSchema).parse(raw)

const paragraph = (id: string, text: string) => ({
  id,
  component: "Paragraph",
  text,
  fold: "",
  aside: "",
})

const plot = (id: string, question: string, value: number) => ({
  id,
  component: "Plot",
  question,
  relation: "part",
  data: [
    { name: "架空の工程", type: "N", values: ["甲", "乙", "丙", "丁", "戊"] },
    { name: "分", type: "Q", values: [value, 77, 66, 55, 44] },
  ],
})

const kindsOf = (report: Parameters<typeof reportDraft>[0], kind: string) =>
  reportViolations(reportDraft(report)).filter((violation) => violation.kind === kind)

describe("components を入力にした字・印・番号の検査", () => {
  it("Row の中の段落と振り返りの要約の壊れた印を数える", () => {
    const components = parts(
      { id: "root", component: "Report", children: ["s1"] },
      {
        id: "s1",
        component: "Section",
        heading: "架空の節",
        children: ["row"],
      },
      { id: "row", component: "Row", children: ["p1"] },
      paragraph("p1", "架空の {{x}}"),
    )

    expect(
      kindsOf(
        {
          components,
          retrospective: {
            kind: "recorded",
            summary: "架空の {{y}}",
            drafts: [],
            blocks: [],
          },
        },
        "broken-inline-mark",
      ),
    ).toEqual([{ kind: "broken-inline-mark", count: 2 }])
  })

  it("Card の先頭の見出しの段落の語を平語として見つける", () => {
    const components = parts(
      { id: "root", component: "Report", children: ["s1"] },
      {
        id: "s1",
        component: "Section",
        heading: "架空の節",
        children: ["card"],
      },
      { id: "card", component: "Card", child: "col" },
      { id: "col", component: "Column", children: ["title", "p1"] },
      paragraph("title", "架空の再演の枠"),
      paragraph("p1", "架空の段落。"),
    )

    expect(kindsOf({ components }, "plain-word")).toEqual([
      { kind: "plain-word", count: 1, spellings: ["再演"] },
    ])
  })

  it("図・節・振り返りの順に plot を数え、Column の中の段落の数とのずれを位置で返す", () => {
    const components = parts(
      {
        id: "root",
        component: "Report",
        children: ["s1"],
        figure: "fig",
        retrospective: { summary: "架空の要約", drafts: [], blocks: ["rb"] },
      },
      {
        id: "s1",
        component: "Section",
        heading: "架空の節",
        children: ["col"],
      },
      { id: "col", component: "Column", children: ["p1"] },
      paragraph("p1", "所要は 1.2 だった。"),
      plot("fig", "架空の図 3", 45),
      plot("rb", "架空の振り返りの図 3", 1200),
    )

    expect(kindsOf({ components }, "figure-number-mismatch")).toEqual([
      {
        kind: "figure-number-mismatch",
        count: 1,
        faults: [{ plot: 2, column: 2, bodyNumber: 1 }],
      },
    ])
  })

  it("Card の中の plot の題に数が無ければ数える", () => {
    const components = parts(
      { id: "root", component: "Report", children: ["s1"] },
      {
        id: "s1",
        component: "Section",
        heading: "架空の節",
        children: ["card"],
      },
      { id: "card", component: "Card", child: "p" },
      plot("p", "どの工程が大半か", 4),
    )

    expect(kindsOf({ components }, "plot-title-without-number")).toEqual([
      { kind: "plot-title-without-number", count: 1 },
    ])
  })

  it("旧い入力でも、図・節・振り返りの順の通し番号が components の入力と同じになる", () => {
    const plotBlock = (value: number) =>
      plotBlockSchema.parse({
        kind: "plot",
        question: "架空の図 3",
        relation: "part",
        data: [
          { name: "架空の工程", type: "N", values: ["甲", "乙", "丙", "丁", "戊"] },
          { name: "分", type: "Q", values: [value, 77, 66, 55, 44] },
        ],
      })
    const figure = plotBlock(45)
    const retrospectivePlot = plotBlock(1200)

    expect(
      kindsOf(
        {
          conclusion: "架空の所要は 1.2 だった。",
          figure,
          retrospective: {
            kind: "recorded",
            summary: "架空の要約",
            drafts: [],
            blocks: [retrospectivePlot],
          },
        },
        "figure-number-mismatch",
      ),
    ).toEqual([
      {
        kind: "figure-number-mismatch",
        count: 1,
        faults: [{ plot: 2, column: 2, bodyNumber: 1 }],
      },
    ])
  })

  it("旧い形の panel の題は、Card の先頭の見出しの段落として壊れた印・矢印にも読まれる", () => {
    const panel: SectionBlock = {
      kind: "panel",
      title: "架空の {{x}} と 甲 → 乙 と 1.2",
      blocks: [{ kind: "text", text: "架空の段落。", fold: "", aside: "" }],
      fold: "",
      aside: "",
    }
    const sections = [{ heading: "", shapeTag: "unspecified", blocks: [panel] }] as const

    expect(kindsOf({ sections }, "broken-inline-mark")).toEqual([
      { kind: "broken-inline-mark", count: 1 },
    ])
    expect(kindsOf({ sections }, "arrow-in-prose")).toEqual([{ kind: "arrow-in-prose", count: 1 }])
  })

  it("Row の中の Markdown の表の記法を数える", () => {
    const components = parts(
      { id: "root", component: "Report", children: ["s1"] },
      {
        id: "s1",
        component: "Section",
        heading: "架空の節",
        children: ["row"],
      },
      { id: "row", component: "Row", children: ["m1"] },
      {
        id: "m1",
        component: "Markdown",
        markdown: "| a | b |\n| - | - |\n| 1 | 2 |",
        fold: "",
        aside: "",
      },
    )

    expect(kindsOf({ components }, "markdown-notation")).toEqual([
      { kind: "markdown-notation", count: 1, notations: ["table"] },
    ])
  })
})
