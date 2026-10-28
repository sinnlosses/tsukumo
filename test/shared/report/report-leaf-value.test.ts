import { describe, expect, it } from "vitest"

import { plotBlockSchema } from "../../../src/shared/report/figure-grammar.ts"
import { parseReportSections, type ReportBlock } from "../../../src/shared/report/report-block.ts"
import {
  reportLeafLayoutOf,
  type ReportLeafLayout,
} from "../../../src/shared/report/report-leaf-value.ts"
import { captionNumbers, reportMarkdownText, section } from "../../fixture/report-markdown.ts"

const memo = (text: string, aside = ""): ReportBlock => ({
  kind: "note",
  tone: "memo",
  text,
  fold: "",
  aside,
})

const table = (
  extra: Partial<Extract<ReportBlock, { readonly kind: "table" }>> = {},
): ReportBlock => ({
  kind: "table",
  title: "架空の表",
  columns: ["架空の列"],
  rows: [["架空の値"]],
  rest: "",
  fold: "",
  aside: "",
  ...extra,
})

const plotOf = (relation: string, data: unknown[], form?: string): ReportBlock =>
  plotBlockSchema.parse({
    kind: "plot",
    question: "架空の題 3 件",
    data,
    relation,
    ...(form === undefined ? {} : { form }),
  })

const labels = ["甲", "乙", "丙", "丁", "戊"]
const barPlot = () =>
  plotOf("part", [
    { name: "工程", type: "N", values: labels },
    { name: "分", type: "Q", values: [4, 31, 12, 9, 3] },
  ])
const tablePlot = () =>
  plotOf(
    "compare",
    [
      { name: "項目", type: "N", values: ["甲", "乙", "丙"] },
      { name: "分", type: "Q", values: [4, 31, 12] },
    ],
    "bullet",
  )

const reportLeafValues = (
  sections: Parameters<typeof reportLeafLayoutOf>[0],
): ReportLeafLayout["values"] => reportLeafLayoutOf(sections).values

describe("reportLeafLayoutOf", () => {
  it("図と表の番号は節をまたいで通しで数え、題の無い塊は番号を持たない", () => {
    const values = reportLeafValues([
      section([table(), reportMarkdownText("架空の本文。"), table({ fold: "架空の畳み" })]),
      section([
        { kind: "mermaid", title: "", source: "flowchart TD\n  A --> B", fold: "", aside: "" },
        table(),
      ]),
    ])

    expect(values.map((blocks) => blocks.map((value) => value.captionNumber))).toEqual([
      [{ kind: "table", ordinal: 1 }, { kind: "none" }, { kind: "table", ordinal: 2 }],
      [
        { kind: "figure", ordinal: 1 },
        { kind: "table", ordinal: 3 },
      ],
    ])
  })

  it("row・panel の子は葉と同じ手で数え、番号は子の順に続く", () => {
    const cell = { kind: "table", title: "架空の表", columns: ["列", "数"], rows: [["値", "1"]] }
    const [blocks] = reportLeafValues(
      parseReportSections([
        {
          heading: "",
          blocks: [{ kind: "row", blocks: [cell, cell], aside: "架空の枠の出典" }, cell],
        },
      ]).sections,
    )

    expect(blocks?.[0]?.children.map((value) => value.captionNumber)).toEqual([
      { kind: "table", ordinal: 1 },
      { kind: "table", ordinal: 2 },
    ])
    expect(blocks?.[0]?.gutterNotes).toEqual([{ label: "", text: "架空の枠の出典" }])
    expect(blocks?.[1]?.captionNumber).toEqual({ kind: "table", ordinal: 3 })
  })

  it("memo の傍注は直前の葉へ寄り、memo 自身は寄せたことだけを持つ。節の最初の memo は自分で持つ", () => {
    const [first, second] = reportLeafValues([
      section([
        memo("架空の頭の覚え書き。"),
        table({ aside: "架空の出典" }),
        memo("架空の覚え書き。"),
      ]),
      section([reportMarkdownText("架空の本文。"), memo("架空の別の覚え書き。", "架空の補足")]),
    ])

    expect(first?.map((value) => [value.mergedIntoPrevious, value.gutterNotes])).toEqual([
      [false, [{ label: "メモ", text: "架空の頭の覚え書き。" }]],
      [
        false,
        [
          { label: "", text: "架空の出典" },
          { label: "メモ", text: "架空の覚え書き。" },
        ],
      ],
      [true, []],
    ])
    expect(second?.[0]?.gutterNotes).toEqual([
      { label: "メモ", text: "架空の別の覚え書き。" },
      { label: "", text: "架空の補足" },
    ])
  })

  it("表の札の色は、その表が使う字だけを、レポート全体の出現順で割り当てる", () => {
    const [blocks] = reportLeafValues([
      section([
        table({ rows: [[{ tag: "甲" }], [{ tag: "乙" }]] }),
        table({ rows: [[{ tag: "丙" }], [{ tag: "甲" }]] }),
        reportMarkdownText("架空の本文。"),
      ]),
    ])

    expect(blocks?.map((value) => value.tagTones)).toEqual([
      { 甲: "tag-1", 乙: "tag-2" },
      { 甲: "tag-1", 丙: "tag-3" },
      {},
    ])
  })

  it("plot の番号の種類は描く形に合わせる（グラフは図、表に落ちたものは表）", () => {
    const sections = [section([barPlot(), tablePlot(), barPlot(), table()])]
    const [blocks] = reportLeafValues(sections)

    expect(blocks?.map((value) => value.captionNumber)).toEqual([
      { kind: "figure", ordinal: 1 },
      { kind: "table", ordinal: 1 },
      { kind: "figure", ordinal: 2 },
      { kind: "table", ordinal: 2 },
    ])
    expect(captionNumbers(sections)).toEqual(["図 1", "表 1", "図 2", "表 2"])
  })
})
