import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../../src/server/report/core/report-usage.ts"
import type { ReportBlock, ReportSection } from "../../../../src/shared/report/report-block.ts"
import { reportEvent, reportOfSections } from "../../../fixture/report-event.ts"

describe("reportUsageEntryOf", () => {
  describe("節の札と、札が許さない塊", () => {
    const list = (count: number): ReportBlock => ({
      kind: "list",
      style: "bullet",
      items: Array.from({ length: count }, () => ({ label: "", text: "架空", done: false })),
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
      source: "架空A -> 架空B: 渡す",
      fold: "",
      aside: "",
    }
    const usageOf = (shapeTag: ReportSection["shapeTag"], block: ReportBlock) =>
      reportUsageEntryOf(
        reportOfSections([{ heading: "", shapeTag, blocks: [block, block] }]),
        "claude-session-1",
        1_000,
        false,
      ).shapeTags

    it.each([["cause", list(2), "list"]] as const)(
      "%s の札の節の %o は許さない組に数える",
      (shapeTag, block, blockKind) => {
        expect(usageOf(shapeTag, block)).toEqual({
          sectionShapeTags: [shapeTag],
          forbiddenShapeSectionCount: 1,
          forbiddenShapeBlocks: [{ shapeTag, blockKind, count: 2 }],
        })
      },
    )

    it.each([["cause", graph]] as const)("%s の札の節の %o は数えない", (shapeTag, block) => {
      expect(usageOf(shapeTag, block)).toEqual({
        sectionShapeTags: [shapeTag],
        forbiddenShapeSectionCount: 0,
        forbiddenShapeBlocks: [],
      })
    })

    it("節ごとの札を順に持ち、figure の図は節に数えない", () => {
      const entry = reportUsageEntryOf(
        reportEvent({
          figure: {
            kind: "graph",
            title: "",
            direction: "TD",
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
        sectionShapeTags: ["cause", "unspecified", "cause"],
        forbiddenShapeSectionCount: 2,
        forbiddenShapeBlocks: [
          { shapeTag: "cause", blockKind: "list", count: 1 },
          { shapeTag: "cause", blockKind: "table", count: 1 },
        ],
      })
    })
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
    const dimension = (before: string): ReportBlock => ({
      kind: "dimension",
      title: "",
      parts: [
        { name: "架空の領域", size: "", before: "" },
        { gap: "8px", before },
      ],
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
      ["dimensionBefore", dimension("12px"), ["dimensionBefore"]],
      ["dimensionBefore（前の値なし）", dimension(""), []],
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
            items: [{ label: "架空の名前", text: "架空の段", done: false }],
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

  it("知らない種類で境界で落とした塊の数と、渡した時刻・セッションIDをそのまま運ぶ", () => {
    const event = reportOfSections([], 2)

    const entry = reportUsageEntryOf(event, "claude-session-9", 12_345, false)

    expect(entry).toEqual({
      at: 12_345,
      sessionId: "claude-session-9",
      figure: { figureKind: "none", noneReason: "unrecorded" },
      shapeTags: { sectionShapeTags: [], forbiddenShapeSectionCount: 0, forbiddenShapeBlocks: [] },
      blockKinds: [],
      blockFields: [],
      notations: [],
      containedNotations: [],
      escapeNotations: [],
      unknownBlockCount: 2,
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
      argumentChars: { total: 0, fields: {} },
      inheritedFields: [],
    })
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
