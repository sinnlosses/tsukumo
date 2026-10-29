import { describe, expect, it } from "vitest"

import { parseReportFigure } from "../../../src/shared/report/a2ui-report-catalog.ts"
import {
  figureBlockSchema,
  namedWriterBlockSchema,
  parseReportBlocks,
  type ReportBlock,
} from "../../../src/shared/report/report-block.ts"

const text = (value: string): ReportBlock => ({ kind: "text", text: value, fold: "", aside: "" })

const firstOf = (block: unknown): unknown => parseReportBlocks([block])[0]

describe("stats の個数の説明", () => {
  const item = { before: "", value: "1", label: "架空" }
  const statsWith = (count: number): unknown =>
    firstOf({ kind: "stats", items: Array.from({ length: count }, () => item), fold: "" })

  it("2つの stats は受け付けず、3つと4つは受け付ける", () => {
    expect(statsWith(2)).toBeUndefined()
    expect(statsWith(3)).toMatchObject({ kind: "stats" })
    expect(statsWith(4)).toMatchObject({ kind: "stats" })
    expect(statsWith(5)).toBeUndefined()
  })
})

describe("parseReportBlocks", () => {
  it("配列でない値は空", () => {
    expect(parseReportBlocks(undefined)).toEqual([])
    expect(parseReportBlocks({ kind: "text" })).toEqual([])
  })

  it("崩れた塊と知らない種類の塊は落とし、残りを順に返す", () => {
    expect(
      parseReportBlocks([{ kind: "架空の種類" }, text("架空の一。"), { kind: "text" }]),
    ).toEqual([text("架空の一。")])
  })

  it("stats の total は省くと空文字になり、渡せば残る", () => {
    const item = { before: "", value: "1", label: "架空" }
    const parse = (extra: object): unknown =>
      firstOf({ kind: "stats", items: [{ ...item, ...extra }, item, item], fold: "", aside: "" })

    expect(parse({})).toMatchObject({ items: [{ total: "" }, { total: "" }, { total: "" }] })
    expect(parse({ total: "5" })).toMatchObject({
      items: [{ total: "5" }, { total: "" }, { total: "" }],
    })
  })

  it("stats の series と better は省くと空になり、渡せば残る", () => {
    const item = { before: "", value: "1", label: "架空" }
    const parse = (extra: object): unknown =>
      firstOf({ kind: "stats", items: [{ ...item, ...extra }, item, item], fold: "" })

    expect(parse({})).toMatchObject({ items: [{ series: [], better: "" }, {}, {}] })
    expect(parse({ series: [1, 2, 3], better: "down" })).toMatchObject({
      items: [
        { series: [1, 2, 3], better: "down" },
        { series: [], better: "" },
        { series: [], better: "" },
      ],
    })
  })

  it("table の rest は省くと空文字になり、渡せば残る", () => {
    const parse = (extra: object): unknown =>
      firstOf({ kind: "table", title: "", columns: ["a", "b"], rows: [["1", "2"]], ...extra })

    expect(parse({})).toMatchObject({ rest: "" })
    expect(parse({ rest: "ほか 3 件" })).toMatchObject({ rest: "ほか 3 件" })
  })

  it("code の marks は省くと空になり、形の違う印は塊ごと受けない", () => {
    const code = { kind: "code", language: "ts", source: "架空" }

    expect(firstOf(code)).toMatchObject({ marks: [], path: "" })
    expect(firstOf({ ...code, marks: [{ lines: "1", label: "架空" }] })).toMatchObject({
      marks: [{ lines: "1", label: "架空" }],
    })
    expect(firstOf({ ...code, marks: [{ lines: 1, label: "架空" }] })).toBeUndefined()
  })

  it("どの種類の塊も aside は省くと空文字になり、渡せば残る", () => {
    const blocks = parseReportBlocks([
      { kind: "text", text: "架空の本文。" },
      { kind: "note", tone: "memo", text: "架空の覚え書き。", aside: "架空の出典" },
      {
        kind: "table",
        title: "",
        columns: ["a", "b"],
        rows: [["1", "2"]],
        aside: "架空の表の出典",
      },
    ])

    expect(blocks.map((block) => block.aside)).toEqual(["", "架空の出典", "架空の表の出典"])
  })

  it("beforeAfter の塊は前と後の側が画像・コード・箇条のどれかで、左右で種類が違っても受ける", () => {
    const beforeAfter = {
      kind: "beforeAfter",
      title: "架空の前後",
      before: { kind: "points", points: ["架空の1行"] },
      after: { kind: "image", path: "架空/after.png" },
      fold: "",
      aside: "",
    }

    expect(firstOf(beforeAfter)).toEqual(beforeAfter)
    expect(
      firstOf({ ...beforeAfter, before: { kind: "code", language: "ts", source: "架空" } }),
    ).toMatchObject({ before: { kind: "code" } })
    const region = { left: 10, top: 20, width: 30, height: 40 }
    const withRegion = { ...beforeAfter, after: { kind: "image", path: "架空/after.png", region } }
    expect(firstOf(withRegion)).toMatchObject({ after: { region } })
    for (const broken of [
      { ...withRegion, after: { ...withRegion.after, region: { left: 1 } } },
      { ...beforeAfter, after: undefined },
      { ...beforeAfter, before: { kind: "points", points: [] } },
      { ...beforeAfter, before: { kind: "text", text: "架空" } },
    ]) {
      expect(firstOf(broken)).toBeUndefined()
    }
  })

  it("beforeAfter の側に mermaid を置け、graph の側は受けない", () => {
    const graph = {
      kind: "graph",
      direction: "LR",
      source: "(架空の始点) -> 架空の処理",
    }
    const beforeAfter = (before: object, after: object) => ({
      kind: "beforeAfter",
      title: "",
      before,
      after,
      fold: "",
      aside: "",
    })
    const mermaid = { kind: "mermaid", source: "sequenceDiagram\n  A->>B: 架空" }

    expect(firstOf(beforeAfter(mermaid, mermaid))).toMatchObject({
      before: mermaid,
      after: mermaid,
    })
    expect(firstOf(beforeAfter(graph, mermaid))).toBeUndefined()
  })

  it("compare の塊は側がちょうど2つで箇条があるときだけ受ける", () => {
    const side = { heading: "案A", points: ["架空の1行"] }
    const compare = { kind: "compare", title: "", sides: [side, side], fold: "", aside: "" }

    expect(firstOf(compare)).toEqual(compare)
    for (const broken of [
      { ...compare, sides: [side] },
      { ...compare, sides: [side, side, side] },
      { ...compare, sides: [side, { heading: "案B", points: [] }] },
    ]) {
      expect(firstOf(broken)).toBeUndefined()
    }
  })

  it("matrix の塊を受け、状態の外の値の行を持つ塊は落とす", () => {
    const matrix = {
      kind: "matrix",
      title: "架空の対応",
      columns: ["列A", "列B"],
      rows: [{ name: "行1", cells: ["ok", "na"] }],
      fold: "",
      aside: "",
    }
    const broken = { ...matrix, rows: [{ name: "行1", cells: ["ok", "good"] }] }

    expect(firstOf(matrix)).toEqual(matrix)
    expect(firstOf(broken)).toBeUndefined()
  })

  it("image の塊を受けて省いた notes を空の並びで、fold を空文字で補い、path か caption の無い塊は落とす", () => {
    const image = { kind: "image", path: "架空/after.png", caption: "架空の画面" }
    const annotated = { ...image, notes: ["左上の架空の帯"] }

    expect(parseReportBlocks([image, annotated])).toEqual([
      { ...image, notes: [], fold: "", aside: "" },
      { ...annotated, fold: "", aside: "" },
    ])
    expect(
      parseReportBlocks([
        { kind: "image", caption: "架空" },
        { kind: "image", path: "架空.png" },
      ]),
    ).toEqual([])
  })

  it("mermaid と chart の塊は省いた title を空文字で補う", () => {
    const mermaid = { kind: "mermaid", source: "sequenceDiagram\n  A ->> B: x" }
    const chart = {
      kind: "chart",
      chartKind: "bar",
      labels: ["架空の一"],
      series: [{ name: "架空の系列", values: [1] }],
    }

    expect(parseReportBlocks([mermaid, chart])).toEqual([
      { ...mermaid, title: "", fold: "", aside: "" },
      { ...chart, title: "", horizontal: false, emphasis: [], fold: "", aside: "" },
    ])
  })

  it("chart の chartKind は arrow・slope・span・share を受け、未知の種類は受けない", () => {
    const chart = {
      kind: "chart",
      labels: ["架空の一"],
      series: [
        { name: "架空の前", values: [1] },
        { name: "架空の後", values: [2] },
      ],
    }
    const parsed = (chartKind: string) => parseReportBlocks([{ ...chart, chartKind }])

    expect(parsed("arrow")).toHaveLength(1)
    expect(parsed("slope")).toHaveLength(1)
    expect(parsed("span")).toHaveLength(1)
    expect(parsed("share")).toHaveLength(1)
    expect(parsed("radar")).toHaveLength(0)
  })

  describe("svg の塊", () => {
    const rect = { kind: "rect", x: 10, y: 10, width: 100, height: 40 }
    const line = { kind: "line", x1: 0, y1: 0, x2: 50, y2: 50 }
    const textShape = { kind: "text", x: 5, y: 5, text: "架空の字" }
    const svg = { kind: "svg", width: 200, height: 100, shapes: [rect, line, textShape] }

    it("rect・line・text の3種を読み、省いた label・emphasis・arrow・title・fold を補う", () => {
      expect(parseReportBlocks([svg])).toEqual([
        {
          ...svg,
          title: "",
          fold: "",
          aside: "",
          legend: [],
          shapes: [
            { ...rect, label: "", sub: "", emphasis: false, labelAt: "center", tone: "none" },
            { ...line, arrow: false, label: "", dashed: false, tone: "none" },
            textShape,
          ],
        },
      ])
    })

    it("beforeAfter の側に置ける", () => {
      const side = { kind: "svg", width: 200, height: 100, shapes: [textShape] }

      expect(
        parseReportBlocks([{ kind: "beforeAfter", title: "t", before: side, after: side }]),
      ).toHaveLength(1)
    })

    it("図形が無い・大きさが正でない・知らない図形の塊は落とす", () => {
      const broken = [
        { ...svg, shapes: [] },
        { ...svg, width: 0 },
        { ...svg, shapes: [{ kind: "circle", x: 1, y: 1 }] },
        { ...svg, shapes: [{ ...rect, width: -1 }] },
      ]

      expect(parseReportBlocks(broken)).toEqual([])
    })
  })

  describe("graph の塊", () => {
    const graph = {
      kind: "graph",
      direction: "TD",
      source: "(架空の始点) -> 架空の処理",
    }
    const blocksOf = (block: unknown) => parseReportBlocks([block])

    it("通り、title・fold は空文字で、legend は空の並びで補う", () => {
      expect(blocksOf(graph)).toEqual([{ ...graph, title: "", fold: "", aside: "", legend: [] }])
      expect(figureBlockSchema.safeParse(graph).success).toBe(true)
    })

    it("legend の色の名前の並びを受け、a〜e の外の色は落ちる", () => {
      const legend = [{ tone: "a", label: "架空の層" }]

      expect(blocksOf({ ...graph, legend })).toEqual([
        { ...graph, title: "", fold: "", aside: "", legend },
      ])
      expect(
        figureBlockSchema.safeParse({ ...graph, legend: [{ tone: "f", label: "架空" }] }).success,
      ).toBe(false)
    })

    it("nodes・edges の旧い形と、節点が1つも無い source は落ちる", () => {
      const broken = [
        {
          kind: "graph",
          direction: "TD",
          nodes: [{ id: "a", label: "架空", shape: "box" }],
          edges: [],
        },
        { ...graph, source: "" },
        { ...graph, source: "\n  \n" },
      ]
      for (const block of broken) {
        expect(blocksOf(block)).toEqual([])
        expect(figureBlockSchema.safeParse(block).success).toBe(false)
      }
    })
  })

  describe("claims の塊", () => {
    const claimsWith = (item: object) => ({ kind: "claims", items: [item] })
    const blocksOf = (block: unknown) => parseReportBlocks([block])

    it("確定の項目は根拠と確かめ方を省くと空文字で補って受ける", () => {
      expect(blocksOf(claimsWith({ claim: "架空の主張", certainty: "confirmed" }))).toEqual([
        {
          kind: "claims",
          items: [{ claim: "架空の主張", certainty: "confirmed", basis: "", howToVerify: "" }],
          fold: "",
          aside: "",
        },
      ])
    })

    it.each([
      ["推測で確かめ方なし", { certainty: "inferred" }],
      ["未確認で確かめ方が空白だけ", { certainty: "unverified", howToVerify: "  " }],
    ])("%s は受けず、howToVerify を名指して差し戻す", (_, extra) => {
      const block = claimsWith({ claim: "架空の主張", basis: "架空の根拠", ...extra })

      expect(blocksOf(block)).toEqual([])
      expect(
        namedWriterBlockSchema.safeParse(block).error?.issues.map((issue) => issue.path),
      ).toEqual([["items", 0, "howToVerify"]])
    })

    it("確定でない項目も確かめ方があれば受け、列挙の外の確度は受けない", () => {
      const item = { claim: "架空の主張", howToVerify: "架空の確かめ方" }

      expect(blocksOf(claimsWith({ ...item, certainty: "inferred" }))).toHaveLength(1)
      expect(blocksOf(claimsWith({ ...item, certainty: "unverified" }))).toHaveLength(1)
      expect(blocksOf(claimsWith({ ...item, certainty: "架空の確度" }))).toEqual([])
    })
  })

  it("外した種類の figure の旧い記録は unrecorded に畳む", () => {
    expect(parseReportFigure({ kind: "dimension", title: "", parts: [] })).toEqual({
      kind: "none",
      reason: "unrecorded",
    })
  })
})
