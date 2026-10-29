import { describe, expect, it } from "vitest"

import {
  isRestatementRequest,
  reportUsageEntryOf,
} from "../../../../src/server/report/core/report-usage.ts"
import type { ReportBlock, ReportSection } from "../../../../src/shared/report/report-block.ts"
import { reportEvent, reportOfDrawn, reportOfSections } from "../../../fixture/report-event.ts"

describe("isRestatementRequest", () => {
  it.each(["どういうこと？", "  もう一度説明して", "意味が分からない"])(
    "聞き直しの語句で始まる架空の依頼 %s は当たる",
    (text) => {
      expect(isRestatementRequest(text)).toBe(true)
    },
  )

  it.each(["次のタスクを進めて", "テストを足して。どこか直す", "", "   "])(
    "語句で始まらない・空の依頼 %j は当たらない",
    (text) => {
      expect(isRestatementRequest(text)).toBe(false)
    },
  )
})

describe("reportUsageEntryOf", () => {
  describe("節の札と、札が許さない塊", () => {
    const list = (count: number): ReportBlock => ({
      kind: "list",
      style: "bullet",
      items: Array.from({ length: count }, () => ({
        label: "",
        text: "架空",
        done: false,
        source: "",
        branch: "",
        branchTone: "warn",
      })),
      fold: "",
      aside: "",
    })
    const table = (columns: readonly [string, ...string[]]): ReportBlock => ({
      kind: "table",
      title: "",
      columns,
      rows: [columns.map(() => "架空"), columns.map(() => "架空")],
      rest: "",
      fold: "",
      aside: "",
    })
    const graph: ReportBlock = {
      kind: "graph",
      title: "",
      direction: "TD",
      legend: [],
      source: "架空A -> 架空B: 渡す",
      fold: "",
      aside: "",
    }
    const usageOf = (block: ReportBlock) =>
      reportUsageEntryOf(
        reportOfSections([{ heading: "", shapeTag: "unspecified", blocks: [block, block] }]),
        "claude-session-1",
        1_000,
        false,
      ).shapeTags

    it.each([
      [list(2), "list"],
      [graph, "graph"],
      [table(["a", "b", "c"]), "table"],
    ] as const)("%o は札が許さない組に数えず、種類だけを節に持つ", (block, blockKind) => {
      expect(usageOf(block)).toEqual({
        sectionShapeTags: ["unspecified"],
        sectionBlockKinds: [[blockKind]],
        forbiddenShapeSectionCount: 0,
        forbiddenShapeBlocks: [],
      })
    })

    it("節の数だけ unspecified を持ち、figure の図は節に数えない", () => {
      const entry = reportUsageEntryOf(
        reportOfDrawn({
          figure: {
            kind: "graph",
            title: "",
            direction: "TD",
            legend: [],
            source: "架空A -> 架空B: 渡す",
            fold: "",
            aside: "",
          },
          sections: [
            { heading: "架空の節1", shapeTag: "cause", blocks: [list(2)] },
            { heading: "架空の節2", shapeTag: "unspecified", blocks: [list(2)] },
            { heading: "架空の節3", shapeTag: "cause", blocks: [table(["a", "b", "c"])] },
          ],
        }),
        "claude-session-1",
        1_000,
        false,
      )

      expect(entry.shapeTags).toEqual({
        sectionShapeTags: ["unspecified", "unspecified", "unspecified"],
        sectionBlockKinds: [["list"], ["list"], ["table"]],
        forbiddenShapeSectionCount: 0,
        forbiddenShapeBlocks: [],
      })
    })
  })

  it("list の style と mermaid の図種は重複を畳んで持つ", () => {
    const list = (style: "bullet" | "ordered"): ReportBlock => ({
      kind: "list",
      style,
      items: [{ label: "", text: "架空", done: false, source: "", branch: "", branchTone: "warn" }],
      fold: "",
      aside: "",
    })
    const mermaid = (source: string): ReportBlock => ({
      kind: "mermaid",
      title: "",
      source,
      fold: "",
      aside: "",
    })
    const entry = reportUsageEntryOf(
      reportOfSections([
        {
          heading: "架空の節",
          shapeTag: "unspecified",
          blocks: [
            list("bullet"),
            list("bullet"),
            list("ordered"),
            mermaid("sequenceDiagram\n  A->>B: 架空"),
            mermaid("%% 架空\nsequenceDiagram\n  A->>B: 架空"),
          ],
        },
      ]),
      "claude-session-1",
      1_000,
      false,
    )

    expect(entry.listStyles).toEqual(["bullet", "ordered"])
    expect(entry.mermaidKinds).toEqual(["sequenceDiagram"])
  })

  it("塊の種類は節をまたいで重複を畳んだ集合にする", () => {
    const event = reportOfSections([
      {
        heading: "架空の節1",
        shapeTag: "unspecified",
        blocks: [
          { kind: "text", text: "架空の根拠。", fold: "", aside: "" },
          {
            kind: "table",
            title: "",
            columns: ["a", "b"],
            rows: [["1", "2"]],
            rest: "",
            fold: "",
            aside: "",
          },
        ],
      },
      {
        heading: "架空の節2",
        shapeTag: "unspecified",
        blocks: [{ kind: "text", text: "架空の根拠その2。", fold: "", aside: "" }],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

    expect(entry.blockKinds).toEqual(["text", "table"])
  })

  describe("塊の欄", () => {
    type StatsItem = Extract<ReportBlock, { kind: "stats" }>["items"][number]
    const stats = (first: Partial<StatsItem>): ReportBlock => {
      const item = (label: string): StatsItem => ({
        before: "",
        value: "1",
        total: "",
        label,
        series: [],
        better: "",
      })
      return {
        kind: "stats",
        items: [{ ...item("架空の一"), ...first }, item("架空の二"), item("架空の三")],
        fold: "",
        aside: "",
      }
    }
    const table = (rest: string): ReportBlock => ({
      kind: "table",
      title: "",
      columns: ["a", "b"],
      rows: [["1", "2"]],
      rest,
      fold: "",
      aside: "",
    })
    const image = (notes: readonly string[]): ReportBlock => ({
      kind: "image",
      path: "架空/after.png",
      caption: "架空の画面",
      notes: [...notes],
      fold: "",
      aside: "",
    })
    const code = (marks: readonly { lines: string; label: string }[]): ReportBlock => ({
      kind: "code",
      language: "ts",
      path: "",
      source: "架空",
      marks,
      fold: "",
      aside: "",
    })
    const text = (aside: string): ReportBlock => ({
      kind: "text",
      text: "架空の本文。",
      fold: "",
      aside,
    })
    const region = { left: 10, top: 20, width: 30, height: 40 }
    type Side = Extract<ReportBlock, { readonly kind: "beforeAfter" }>["before"]
    const beforeAfter = (before: Side, after: Side): ReportBlock => ({
      kind: "beforeAfter",
      title: "",
      before,
      after,
      fold: "",
      aside: "",
    })
    const plain = { kind: "image", path: "架空/a.png" } as const
    const framed = { ...plain, region }

    it.each([
      ["beforeAfterRegion（前の側）", beforeAfter(framed, plain), ["beforeAfterRegion"]],
      ["beforeAfterRegion（後の側）", beforeAfter(plain, framed), ["beforeAfterRegion"]],
      ["beforeAfterRegion（region なし）", beforeAfter(plain, plain), []],
      [
        "beforeAfterRegion（画像でない側）",
        beforeAfter({ kind: "points", points: ["架空"] }, plain),
        [],
      ],
      ["beforeAfterRegion（単体の image）", image([]), []],
    ] as const)("%s の欄", (_, block, expected) => {
      const entry = reportUsageEntryOf(
        reportOfSections([{ heading: "", shapeTag: "unspecified", blocks: [block] }]),
        "claude-session-1",
        1_000,
        false,
      )
      expect(entry.blockFields).toEqual(expected)
    })

    it.each([
      ["tableRest", table("ほか 3 件"), ["tableRest"]],
      ["tableRest（空白だけ）", table(" "), []],
      ["statsBefore", stats({ before: "0" }), ["statsBefore"]],
      ["statsTotal", stats({ total: "5" }), ["statsTotal"]],
      ["statsSeries", stats({ series: [1, 2, 3] }), ["statsSeries"]],
      ["statsBetter", stats({ better: "up" }), ["statsBetter"]],
      ["stats（欄が全部既定）", stats({}), []],
      ["imageNotes", image(["左上の架空の帯"]), ["imageNotes"]],
      ["imageNotes（notes なし）", image([]), []],
      ["codeMarks", code([{ lines: "1", label: "架空" }]), ["codeMarks"]],
      ["codeMarks（marks なし）", code([]), []],
      ["blockAside", text("架空の出典"), ["blockAside"]],
      ["blockAside（空白だけ）", text(" "), []],
    ] as const)("%s の欄", (_, block, expected) => {
      const entry = reportUsageEntryOf(
        reportOfSections([{ heading: "", shapeTag: "unspecified", blocks: [block] }]),
        "claude-session-1",
        1_000,
        false,
      )

      expect(entry.blockFields).toEqual(expected)
    })
  })

  it("既定の値でない塊の欄を、節をまたいで重複を畳んだ集合にする", () => {
    const event = reportOfSections([
      {
        heading: "架空の節1",
        shapeTag: "unspecified",
        blocks: [
          {
            kind: "table",
            title: "",
            columns: ["a", "b"],
            rows: [["架空の", { from: "1", to: "2" }]],
            rest: "",
            fold: "",
            aside: "",
          },
          {
            kind: "stats",
            items: [
              { before: "", value: "1", total: "", label: "架空の一", series: [], better: "" },
              { before: "", value: "2", total: "", label: "架空の二", series: [], better: "" },
              { before: "", value: "3", total: "", label: "架空の三", series: [], better: "" },
            ],
            fold: "",
            aside: "",
          },
        ],
      },
      {
        heading: "架空の節2",
        shapeTag: "unspecified",
        blocks: [
          {
            kind: "list",
            style: "flow",
            items: [
              {
                label: "架空の名前",
                text: "架空の段",
                done: false,
                source: "",
                branch: "",
                branchTone: "warn",
              },
            ],
            fold: "",
            aside: "",
          },
          {
            kind: "table",
            title: "",
            columns: ["a", "b"],
            rows: [["架空の", { from: "3", to: "4" }]],
            rest: "",
            fold: "",
            aside: "",
          },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

    expect(entry.blockFields).toEqual(["tableChange", "listLabel", "listFlow"])
  })

  describe("逃げ道（markdown の塊）の記法", () => {
    const markdown = (body: string): ReportBlock => ({
      kind: "markdown",
      markdown: body,
      fold: "",
      aside: "",
    })
    const image: ReportBlock = {
      kind: "image",
      path: "架空/after.png",
      caption: "架空の画面",
      notes: [],
      fold: "",
      aside: "",
    }

    it.each([
      [
        "外側の箇条書きは notations",
        [markdown("- 架空の1つ目\n- 架空の2つ目")],
        { notations: ["list"], containedNotations: [] },
      ],
      [
        "HTML の容れ物の中の箇条書きは containedNotations",
        [markdown("<details><summary>架空の見出し</summary>\n\n- 架空の1つ目\n\n</details>")],
        { notations: [], containedNotations: ["list"] },
      ],
      [
        "chart のフェンスは塊のある記法",
        [markdown("```chart\n{}\n```")],
        { notations: ["chart"], escapeNotations: [] },
      ],
      [
        "image の塊は数えず、逃げ道に書いた画像だけを数える",
        [image, markdown("![架空](架空/before.png)")],
        { notations: ["image"] },
      ],
      [
        "塊の無い記法 6 種を並びの順に数える",
        [
          markdown(
            [
              '<div class="cols"><div class="card">架空の中身</div></div>',
              "",
              "> 架空の引用",
              "",
              "---",
              "",
              '<svg viewBox="0 0 1 1"></svg>',
              "",
              "<dl><dt>架空の用語</dt><dd>架空の説明</dd></dl>",
              "",
              "<details><summary>架空の見出し</summary>中身</details>",
            ].join("\n"),
          ),
        ],
        { escapeNotations: ["colsCard", "svg", "dl", "quote", "hr", "details"] },
      ],
    ] as const)("%s", (_, blocks, expected) => {
      const entry = reportUsageEntryOf(
        reportOfSections([{ heading: "架空の節", shapeTag: "unspecified", blocks }]),
        "claude-session-1",
        1_000,
        false,
      )

      expect(entry).toMatchObject(expected)
    })
  })

  it("body の読めない型つきフェンスの数を運ぶ", () => {
    const event = reportEvent({ brokenFenceCount: 3 })

    expect(reportUsageEntryOf(event, "claude-session-9", 12_345, false).brokenFenceCount).toBe(3)
  })

  it("知らない種類で境界で落とした塊の数と、渡した時刻・セッションIDをそのまま運ぶ", () => {
    const event = reportOfSections([], 2)

    const entry = reportUsageEntryOf(event, "claude-session-9", 12_345, false)

    expect(entry).toEqual({
      at: 12_345,
      sessionId: "claude-session-9",
      figure: { figureKind: "none", noneReason: "unrecorded" },
      shapeTags: {
        sectionShapeTags: [],
        sectionBlockKinds: [],
        forbiddenShapeSectionCount: 0,
        forbiddenShapeBlocks: [],
      },
      blockKinds: [],
      blockFields: [],
      notations: [],
      containedNotations: [],
      escapeNotations: [],
      componentNames: [],
      markdownNotationKinds: [],
      unknownBlockCount: 2,
      brokenFenceCount: 0,
      listStyles: [],
      mermaidKinds: [],
      hasModifiedFiles: false,
      hasBeforeAfterOrImage: false,
      forTask: false,
      hasFigure: false,
      readImageWithoutImageBlock: false,
      emphasisCount: 0,
      graphEdgeCount: 0,
      graphUnlabeledEdgeCount: 0,
      graphNodeCount: 0,
      hasUnverifiedCheck: false,
      hasHowToVerify: false,
      taskGenre: "none",
      taskOutcome: "none",
      hasFavor: false,
      hasSourceReference: false,
      shortTable: false,
      hasKeyFigures: false,
      conclusionNumbersWithoutKeyFigures: false,
      argumentChars: { total: 0, fields: {} },
      inheritedFields: [],
    })
  })

  it("a2ui の部品は名前だけを重複なしで、Markdown の中身は記法の種類だけを持ち、本文は持たない", () => {
    const entry = reportUsageEntryOf(
      reportEvent({
        components: [
          { id: "p1", component: "Paragraph", text: "架空の本文", fold: "", aside: "" },
          {
            id: "m1",
            component: "Markdown",
            markdown: '> 架空の引用\n\n---\n\n<span class="badge">架空</span>',
            fold: "",
            aside: "",
          },
          { id: "m2", component: "Markdown", markdown: "> 架空の引用", fold: "", aside: "" },
        ],
      }),
      "claude-session-9",
      1,
      false,
    )

    expect(entry.componentNames).toEqual(["Paragraph", "Markdown"])
    expect(entry.markdownNotationKinds).toEqual(["quote", "hr", "badge"])
    const badgeSection: ReportSection = {
      heading: "架空",
      shapeTag: "unspecified",
      blocks: [
        { kind: "markdown", markdown: '<span class="badge">架空</span>', fold: "", aside: "" },
      ],
    }
    expect(
      reportUsageEntryOf(reportOfSections([badgeSection]), "claude-session-9", 1, false)
        .escapeNotations,
    ).toEqual([])
    expect(JSON.stringify([entry.componentNames, entry.markdownNotationKinds])).not.toContain(
      "架空の",
    )
  })

  it("配置の部品の中・図・振り返りの葉の種類と欄を全部拾い、根から届かない葉は拾わない", () => {
    const item = {
      before: "0",
      value: "1",
      total: "",
      label: "架空",
      series: [],
      better: "" as const,
    }
    const entry = reportUsageEntryOf(
      reportEvent({
        components: [
          {
            id: "root",
            component: "Report",
            children: ["s1"],
            figure: "fig",
            retrospective: { summary: "架空", drafts: [], blocks: ["retro"] },
          },
          { id: "s1", component: "Section", heading: "架空の節", children: ["row"] },
          { id: "row", component: "Row", children: ["card", "tabs"] },
          { id: "card", component: "Card", child: "col" },
          { id: "col", component: "Column", children: ["stats"] },
          { id: "stats", component: "Stats", items: [item], fold: "", aside: "" },
          { id: "tabs", component: "Tabs", tabs: [{ title: "架空", child: "pic" }] },
          {
            id: "pic",
            component: "Picture",
            path: "架空/a.png",
            caption: "架空",
            notes: ["架空の帯"],
            fold: "",
            aside: "架空の出典",
          },
          { id: "fig", component: "Mermaid", title: "", source: "graph TD", fold: "", aside: "" },
          {
            id: "retro",
            component: "Code",
            language: "ts",
            path: "",
            source: "架空",
            marks: [{ lines: "1", label: "架空" }],
            fold: "",
            aside: "",
          },
          {
            id: "orphan",
            component: "Table",
            title: "",
            columns: ["a", "b"],
            rows: [["1", "2"]],
            rest: "ほか",
            fold: "",
            aside: "",
          },
        ],
      }),
      "claude-session-1",
      1_000,
      false,
    )

    expect(entry.blockKinds).toEqual(["mermaid", "stats", "image", "code"])
    expect(entry.blockFields).toEqual(["statsBefore", "imageNotes", "codeMarks", "blockAside"])
    expect(entry.shapeTags.sectionBlockKinds).toEqual([["stats", "image"]])
  })

  it("components が空の回は、部品の名前も記法の種類も空", () => {
    const entry = reportUsageEntryOf(reportEvent(), "claude-session-9", 1, false)

    expect(entry.componentNames).toEqual([])
    expect(entry.markdownNotationKinds).toEqual([])
  })

  it("イベントの引数の字数と引き継いだ欄の名前を、本文を含めずにそのまま運ぶ", () => {
    const argumentChars = { total: 321, fields: { conclusion: 12, sections: 200 } }

    const entry = reportUsageEntryOf(
      reportEvent({ argumentChars, inheritedFields: ["favor"], favor: "架空のお願い" }),
      "claude-session-9",
      1,
      false,
    )

    expect(entry.argumentChars).toEqual(argumentChars)
    expect(entry.inheritedFields).toEqual(["favor"])
    expect(JSON.stringify([entry.argumentChars, entry.inheritedFields])).not.toContain("架空の")
  })
})
