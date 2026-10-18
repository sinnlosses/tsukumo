import { describe, expect, it } from "vitest"

import {
  isMainImageFileRead,
  reportUsageEntryOf,
} from "../../../../src/server/report/core/report-usage.ts"
import type { ReportBlock, ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { ReportCheck } from "../../../../src/shared/report/report-check.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

function reportOfSections(
  sections: readonly ReportSection[],
  unknownBlockCount = 0,
): Extract<SessionEvent, { readonly kind: "report" }> {
  return reportEvent({ sections, unknownBlockCount })
}

describe("reportUsageEntryOf", () => {
  describe("節の札と、札が許さない塊", () => {
    const text = (value: string): ReportBlock => ({
      kind: "text",
      text: value,
      fold: "",
      aside: "",
    })
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

    it.each([
      ["cause", list(2), "list"],
      ["quantity", text("架空は 1 から 2 へ、3 件"), "text"],
      ["parallel", table(["架空の項目", "架空の属性"]), "table"],
      ["single", list(1), "list"],
    ] as const)("%s の札の節の %o は許さない組に数える", (shapeTag, block, blockKind) => {
      expect(usageOf(shapeTag, block)).toEqual({
        sectionShapeTags: [shapeTag],
        forbiddenShapeSectionCount: 1,
        forbiddenShapeBlocks: [{ shapeTag, blockKind, count: 2 }],
      })
    })

    it.each([
      ["cause", graph],
      ["quantity", text("架空は 1 から 2 へ")],
      ["parallel", table(["架空の項目", "架空の属性1", "架空の属性2"])],
      ["unspecified", list(1)],
    ] as const)("%s の札の節の %o は数えない", (shapeTag, block) => {
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

  it("modified のファイルの有無・前後図か画像の有無・task の有無を、塊の欄とは別の真偽値で持つ", () => {
    const files = (change: "modified" | "read"): ReportBlock => ({
      kind: "files",
      items: [{ path: "架空/a.ts", change, note: "" }],
      title: "",
      fold: "",
      aside: "",
    })
    const beforeAfter: ReportBlock = {
      kind: "beforeAfter",
      title: "架空の前後",
      before: { kind: "points", points: ["前"] },
      after: { kind: "points", points: ["後"] },
      fold: "",
      aside: "",
    }
    const image: ReportBlock = {
      kind: "image",
      path: "架空/after.png",
      caption: "架空の画面",
      notes: [],
      fold: "",
      aside: "",
    }
    const task = {
      kind: "task",
      id: "架空-1",
      name: "架空の作業",
      outcome: "finished",
      genre: "work",
    } as const
    const table: readonly {
      readonly blocks: readonly ReportBlock[]
      readonly task: boolean
      readonly expected: readonly [boolean, boolean, boolean]
    }[] = [
      { blocks: [files("modified")], task: false, expected: [true, false, false] },
      { blocks: [files("modified")], task: true, expected: [true, false, true] },
      { blocks: [files("modified"), beforeAfter], task: false, expected: [true, true, false] },
      { blocks: [files("modified"), image], task: true, expected: [true, true, true] },
      { blocks: [files("read")], task: false, expected: [false, false, false] },
      { blocks: [files("read"), image], task: false, expected: [false, true, false] },
    ]

    for (const row of table) {
      const event = reportEvent({
        sections: [{ heading: "", shapeTag: "unspecified", blocks: row.blocks }],
        task: row.task ? task : { kind: "none" },
      })
      const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

      expect([entry.hasModifiedFiles, entry.hasBeforeAfterOrImage, entry.forTask]).toEqual(
        row.expected,
      )
    }
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

  it.each([
    ["行が1つ", 1, true],
    ["行が2つ", 2, true],
    ["行が3つ", 3, false],
  ] as const)("表の%sなら shortTable は %s", (_, rowCount, expected) => {
    const rows = Array.from({ length: rowCount }, () => ["1", "2"])
    const entry = reportUsageEntryOf(
      reportOfSections([
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: [
            { kind: "table", title: "", columns: ["a", "b"], rows, rest: "", fold: "", aside: "" },
          ],
        },
      ]),
      "claude-session-1",
      1_000,
      false,
    )

    expect(entry.shortTable).toBe(expected)
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
    })
  })

  it("イベントの引数の字数を、本文を含めずにそのまま運ぶ", () => {
    const argumentChars = { total: 321, fields: { conclusion: 12, sections: 200 } }

    const entry = reportUsageEntryOf(reportEvent({ argumentChars }), "claude-session-9", 1, false)

    expect(entry.argumentChars).toEqual(argumentChars)
    expect(JSON.stringify(entry.argumentChars)).not.toContain("架空の結論")
  })

  describe("hasFigure", () => {
    const figureOf = (block: ReportBlock): boolean =>
      reportUsageEntryOf(
        reportOfSections([{ heading: "", shapeTag: "unspecified", blocks: [block] }]),
        "claude-session-1",
        1_000,
        false,
      ).hasFigure
    const svgShape = { kind: "text", x: 1, y: 1, text: "架空" } as const
    const codeSide = { kind: "code", language: "ts", source: "x" } as const
    const pointsSide = { kind: "points", points: ["架空の点"] } as const
    const beforeAfterOf = (
      before: Extract<ReportBlock, { kind: "beforeAfter" }>["before"],
      after: Extract<ReportBlock, { kind: "beforeAfter" }>["after"],
    ): ReportBlock => ({ kind: "beforeAfter", title: "", before, after, fold: "", aside: "" })

    it("image・mermaid・svg の塊と、beforeAfter の図の側を図として数える", () => {
      expect(figureOf({ kind: "text", text: "架空の根拠。", fold: "", aside: "" })).toBe(false)
      expect(
        figureOf({ kind: "mermaid", title: "", source: "sequenceDiagram", fold: "", aside: "" }),
      ).toBe(true)
      expect(
        figureOf({
          kind: "image",
          path: "/tmp/a.png",
          caption: "架空",
          notes: [],
          fold: "",
          aside: "",
        }),
      ).toBe(true)
      expect(
        figureOf({
          kind: "graph",
          title: "",
          direction: "TD",
          source: "架空",
          fold: "",
          aside: "",
        }),
      ).toBe(true)
      expect(
        figureOf({
          kind: "svg",
          title: "",
          width: 10,
          height: 10,
          shapes: [svgShape],
          fold: "",
          aside: "",
        }),
      ).toBe(true)
      expect(
        figureOf(
          beforeAfterOf({ kind: "svg", width: 10, height: 10, shapes: [svgShape] }, codeSide),
        ),
      ).toBe(true)
      expect(figureOf(beforeAfterOf(codeSide, pointsSide))).toBe(false)
    })
  })

  describe("readImageWithoutImageBlock", () => {
    const entryOf = (blocks: readonly ReportBlock[], mainReadImageFile: boolean) =>
      reportUsageEntryOf(
        reportOfSections([{ heading: "", shapeTag: "unspecified", blocks }]),
        "claude-session-1",
        1_000,
        mainReadImageFile,
      )
    const text: ReportBlock = { kind: "text", text: "架空の根拠。", fold: "", aside: "" }
    const image: ReportBlock = {
      kind: "image",
      path: "/tmp/a.png",
      caption: "架空",
      notes: [],
      fold: "",
      aside: "",
    }
    const beforeAfterImage: ReportBlock = {
      kind: "beforeAfter",
      title: "",
      before: { kind: "image", path: "/tmp/a.png" },
      after: { kind: "image", path: "/tmp/b.png" },
      fold: "",
      aside: "",
    }

    it("読んだのに image が無ければ真、image か beforeAfter の image の側があるか読んでいなければ偽", () => {
      expect(entryOf([text], true).readImageWithoutImageBlock).toBe(true)
      expect(entryOf([text, image], true).readImageWithoutImageBlock).toBe(false)
      expect(entryOf([beforeAfterImage], true).readImageWithoutImageBlock).toBe(false)
      expect(entryOf([text], false).readImageWithoutImageBlock).toBe(false)
    })
  })

  describe("強調と graph の数", () => {
    const entryOf = (blocks: readonly ReportBlock[]) =>
      reportUsageEntryOf(
        reportOfSections([{ heading: "", shapeTag: "unspecified", blocks }]),
        "claude-session-1",
        1_000,
        false,
      )

    it("強調の対を text・list・表のセルに散らして合計し、インラインコードの中の ** は数えない", () => {
      const entry = entryOf([
        { kind: "text", text: "架空の**結論**と`**飾り**`。", fold: "", aside: "" },
        {
          kind: "list",
          style: "bullet",
          items: [
            { label: "", text: "**一**と**二**", done: false },
            { label: "", text: "なし", done: false },
          ],
          fold: "",
          aside: "",
        },
        {
          kind: "table",
          title: "",
          columns: ["a", "b"],
          rows: [["**甲**", { status: "ok", text: "**乙**" }, { from: "**前**", to: "後" }]],
          rest: "",
          fold: "",
          aside: "",
        },
      ])

      expect(entry.emphasisCount).toBe(6)
    })

    it("graph が2つあれば辺とラベルの無い辺を合計し、節点数は多いほうにする", () => {
      const graph = (source: string): ReportBlock => ({
        kind: "graph",
        title: "",
        direction: "TD",
        source,
        fold: "",
        aside: "",
      })

      const entry = entryOf([
        graph("架空A -> 架空B: 渡す\n架空B -> 架空C"),
        graph("架空D -> 架空E: 呼ぶ"),
      ])

      expect(entry.graphEdgeCount).toBe(3)
      expect(entry.graphUnlabeledEdgeCount).toBe(1)
      expect(entry.graphNodeCount).toBe(3)
    })
  })

  describe("確かめ方の有無", () => {
    const check = (status: ReportCheck["status"], howToVerify: string): ReportCheck => ({
      status,
      label: "架空の確認",
      figure: "",
      command: "",
      detail: "",
      howToVerify,
    })
    const flagsOf = (checks: readonly ReportCheck[]) => {
      const entry = reportUsageEntryOf(reportEvent({ checks }), "claude-session-1", 1_000, false)
      return [entry.hasUnverifiedCheck, entry.hasHowToVerify]
    }

    it("unverified が無ければ両方偽、全部に確かめ方があれば両方真、1つでも空なら確かめ方は偽", () => {
      expect(flagsOf([])).toEqual([false, false])
      expect(flagsOf([check("ok", ""), check("ng", "")])).toEqual([false, false])
      expect(
        flagsOf([check("unverified", "架空の窓を開く"), check("unverified", "架空の札を見る")]),
      ).toEqual([true, true])
      expect(flagsOf([check("unverified", "架空の窓を開く"), check("unverified", " ")])).toEqual([
        true,
        false,
      ])
    })
  })

  describe("報告の種類と必須の塊の手掛かり", () => {
    it.each([
      [
        "genre のある task",
        { kind: "task", id: "架空-1", name: "架空", outcome: "stopped", genre: "decision" },
        ["decision", "stopped"],
      ],
      [
        "genre の無い task",
        { kind: "task", id: "架空-1", name: "架空", outcome: "finished", genre: "unspecified" },
        ["unspecified", "finished"],
      ],
      ["task の無いレポート", { kind: "none" }, ["none", "none"]],
    ] as const)("%s は種類と終わり方をそのまま持つ", (_, task, expected) => {
      const entry = reportUsageEntryOf(reportEvent({ task }), "claude-session-1", 1_000, false)

      expect([entry.taskGenre, entry.taskOutcome]).toEqual(expected)
    })

    it("favor が空白だけなら偽、中身があれば真", () => {
      const favorOf = (favor: string) =>
        reportUsageEntryOf(reportEvent({ favor }), "claude-session-1", 1_000, false).hasFavor

      expect([favorOf(""), favorOf(" "), favorOf("架空のお願い。")]).toEqual([false, false, true])
    })

    it.each([
      [
        "text の URL",
        { kind: "text", text: "架空の出典 https://example.com/a", fold: "", aside: "" },
        true,
      ],
      [
        "list の path:line",
        {
          kind: "list",
          style: "bullet",
          items: [{ label: "", text: "src/a.ts:12 で読む", done: false }],
          fold: "",
          aside: "",
        },
        true,
      ],
      [
        "表のセルの path:line",
        {
          kind: "table",
          title: "",
          columns: ["根拠"],
          rows: [["src/b.ts:3"]],
          rest: "",
          fold: "",
          aside: "",
        },
        true,
      ],
      [
        "note の URL",
        { kind: "note", tone: "info", text: "http://example.com", fold: "", aside: "" },
        true,
      ],
      [
        "markdown の path:line",
        { kind: "markdown", markdown: "> a.ts:1", fold: "", aside: "" },
        true,
      ],
      [
        "code の path",
        {
          kind: "code",
          language: "ts",
          path: "src/a.ts",
          source: "架空",
          marks: [],
          fold: "",
          aside: "",
        },
        true,
      ],
      [
        "path の無い code",
        {
          kind: "code",
          language: "ts",
          path: "",
          source: "https://example.com",
          marks: [],
          fold: "",
          aside: "",
        },
        false,
      ],
      ["行番号の無いパス", { kind: "text", text: "src/a.ts を読んだ", fold: "", aside: "" }, false],
    ] as const)("%s なら出典の有無は %s", (_, block, expected) => {
      const event = reportOfSections([{ heading: "", shapeTag: "unspecified", blocks: [block] }])

      expect(reportUsageEntryOf(event, "claude-session-1", 1_000, false).hasSourceReference).toBe(
        expected,
      )
    })
  })

  describe("figure", () => {
    const image = {
      kind: "image",
      path: "/tmp/a.png",
      caption: "架空",
      notes: [],
      fold: "",
      aside: "",
    } as const

    it("図を置いた回は種類だけを持ち、none の回は理由を持つ（中身は持たない）", () => {
      const placed = reportUsageEntryOf(
        reportEvent({ figure: image }),
        "claude-session-1",
        1_000,
        false,
      )
      const none = reportUsageEntryOf(
        reportEvent({ figure: { kind: "none", reason: "no-material" } }),
        "claude-session-1",
        1_000,
        false,
      )

      expect(placed.figure).toEqual({ figureKind: "image" })
      expect(none.figure).toEqual({ figureKind: "none", noneReason: "no-material" })
    })

    it("figure の図も塊の種類・段1の図・画像の有無に数える", () => {
      const entry = reportUsageEntryOf(
        reportEvent({ figure: image }),
        "claude-session-1",
        1_000,
        true,
      )

      expect(entry.blockKinds).toEqual(["image"])
      expect(entry.hasFigure).toBe(true)
      expect(entry.hasBeforeAfterOrImage).toBe(true)
      expect(entry.readImageWithoutImageBlock).toBe(false)
    })
  })
})

describe("isMainImageFileRead", () => {
  const started = (
    name: string,
    input: unknown,
    parentToolUseId: string | undefined = undefined,
  ): Extract<SessionEvent, { readonly kind: "tool-started" }> => ({
    kind: "tool-started",
    toolUseId: "toolu_1",
    name,
    input,
    parentToolUseId,
  })

  it("メインの Read で、拡張子が画像（png・jpg・jpeg・gif・webp）のどれかなら真（大文字小文字は問わない）", () => {
    expect(isMainImageFileRead(started("Read", { file_path: "/tmp/a.png" }))).toBe(true)
    expect(isMainImageFileRead(started("Read", { file_path: "/tmp/A.JPG" }))).toBe(true)
    expect(isMainImageFileRead(started("Read", { file_path: "/tmp/a.webp" }))).toBe(true)
  })

  it("画像でない拡張子・サブエージェントの呼び出し・Read でないツール・file_path の無い入力は偽", () => {
    expect(isMainImageFileRead(started("Read", { file_path: "/tmp/a.ts" }))).toBe(false)
    expect(isMainImageFileRead(started("Read", { file_path: "/tmp/a.png" }, "toolu_parent"))).toBe(
      false,
    )
    expect(isMainImageFileRead(started("Write", { file_path: "/tmp/a.png" }))).toBe(false)
    expect(isMainImageFileRead(started("Read", {}))).toBe(false)
    expect(isMainImageFileRead(started("Read", undefined))).toBe(false)
  })
})
