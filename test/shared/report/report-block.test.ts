import { describe, expect, it } from "vitest"

import {
  parseReportSections,
  type ReportBlock,
  reportSectionsOfBody,
} from "../../../src/shared/report/report-block.ts"

const text = (value: string): ReportBlock => ({ kind: "text", text: value, fold: "" })

describe("reportSectionsOfBody", () => {
  it("空白だけの本文は節を持たない", () => {
    expect(reportSectionsOfBody("")).toEqual([])
    expect(reportSectionsOfBody(" \n\n ")).toEqual([])
  })

  it("本文は見出しの無い節1つの逃げ道の塊になる（頭の空行と末尾の空白だけを落とす）", () => {
    expect(reportSectionsOfBody("\n\n    架空の字下げ\n\n架空の本文。  \n")).toEqual([
      {
        heading: "",
        blocks: [{ kind: "markdown", markdown: "    架空の字下げ\n\n架空の本文。", fold: "" }],
      },
    ])
  })
})

describe("parseReportSections", () => {
  it("stats の total は省くと空文字になり、渡せば残る", () => {
    const item = { before: "", value: "1", label: "架空" }
    const parse = (extra: object): unknown =>
      parseReportSections([
        {
          heading: "",
          blocks: [{ kind: "stats", items: [{ ...item, ...extra }, item], fold: "" }],
        },
      ]).sections[0]?.blocks[0]

    expect(parse({})).toMatchObject({ items: [{ total: "" }, { total: "" }] })
    expect(parse({ total: "5" })).toMatchObject({ items: [{ total: "5" }, { total: "" }] })
  })

  it("compare の塊は側がちょうど2つで箇条があるときだけ受ける", () => {
    const side = { heading: "案A", points: ["架空の1行"] }
    const compare = { kind: "compare", title: "", sides: [side, side], fold: "" }
    const parse = (block: object): unknown =>
      parseReportSections([{ heading: "", blocks: [block] }])

    expect(parse(compare)).toEqual({
      sections: [{ heading: "", blocks: [compare] }],
      unknownBlockCount: 0,
    })
    for (const broken of [
      { ...compare, sides: [side] },
      { ...compare, sides: [side, side, side] },
      { ...compare, sides: [side, { heading: "案B", points: [] }] },
    ]) {
      expect(parse(broken)).toEqual({ sections: [], unknownBlockCount: 0 })
    }
  })

  it("dimension の塊は領域と余白の混じった並びを受け、省いた size と before を空文字で補う", () => {
    const parse = (parts: readonly object[]): unknown =>
      parseReportSections([
        { heading: "", blocks: [{ kind: "dimension", title: "", parts, fold: "" }] },
      ])

    expect(parse([{ name: "架空の見出し" }, { gap: "26px", before: "28px" }])).toEqual({
      sections: [
        {
          heading: "",
          blocks: [
            {
              kind: "dimension",
              title: "",
              parts: [
                { name: "架空の見出し", size: "", before: "" },
                { gap: "26px", before: "28px" },
              ],
              fold: "",
            },
          ],
        },
      ],
      unknownBlockCount: 0,
    })
    for (const broken of [
      [{ name: "架空の見出し" }],
      [{ name: "架空の見出し" }, { size: "8px" }],
    ]) {
      expect(parse(broken)).toEqual({ sections: [], unknownBlockCount: 0 })
    }
  })

  it("matrix の塊を受け、状態の外の値の行を持つ塊は落とす", () => {
    const matrix = {
      kind: "matrix",
      title: "架空の対応",
      columns: ["列A", "列B"],
      rows: [{ name: "行1", cells: ["ok", "na"] }],
      fold: "",
    }
    const broken = { ...matrix, rows: [{ name: "行1", cells: ["ok", "good"] }] }

    expect(parseReportSections([{ heading: "", blocks: [matrix] }]).sections).toEqual([
      { heading: "", blocks: [matrix] },
    ])
    expect(parseReportSections([{ heading: "", blocks: [broken] }])).toEqual({
      sections: [],
      unknownBlockCount: 0,
    })
  })

  it("image の塊を受けて省いた notes を空の並びで、fold を空文字で補い、path か caption の無い塊は落とす", () => {
    const image = { kind: "image", path: "架空/after.png", caption: "架空の画面" }
    const annotated = { ...image, notes: ["左上の架空の帯"] }

    expect(parseReportSections([{ heading: "", blocks: [image, annotated] }]).sections).toEqual([
      {
        heading: "",
        blocks: [
          { ...image, notes: [], fold: "" },
          { ...annotated, fold: "" },
        ],
      },
    ])
    expect(
      parseReportSections([
        { heading: "", blocks: [{ kind: "image", caption: "架空" }] },
        { heading: "", blocks: [{ kind: "image", path: "架空.png" }] },
      ]),
    ).toEqual({ sections: [], unknownBlockCount: 0 })
  })

  it("mermaid と chart の塊は省いた title を空文字で補う", () => {
    const mermaid = { kind: "mermaid", source: "flowchart LR\n  A --> B" }
    const chart = {
      kind: "chart",
      chartKind: "bar",
      labels: ["架空の一"],
      series: [{ name: "架空の系列", values: [1] }],
    }

    expect(parseReportSections([{ heading: "", blocks: [mermaid, chart] }]).sections).toEqual([
      {
        heading: "",
        blocks: [
          { ...mermaid, title: "", fold: "" },
          { ...chart, title: "", horizontal: false, fold: "" },
        ],
      },
    ])
  })

  it("progress の塊は知らない種類として落とさない（unknownBlockCount が0になる）", () => {
    const progress = {
      kind: "progress",
      steps: ["架空の一", "架空の二"],
      current: 1,
      fold: "",
    }

    const parsed = parseReportSections([{ heading: "", blocks: [progress] }])

    expect(parsed.unknownBlockCount).toBe(0)
    expect(parsed.sections).toEqual([{ heading: "", blocks: [progress] }])
  })

  it("知らない種類の塊は落とし、unknownBlockCount で数える", () => {
    const parsed = parseReportSections([
      { heading: "", blocks: [{ kind: "架空の種類" }, text("架空の一。")] },
    ])

    expect(parsed.unknownBlockCount).toBe(1)
    expect(parsed.sections).toEqual([{ heading: "", blocks: [text("架空の一。")] }])
  })
})
