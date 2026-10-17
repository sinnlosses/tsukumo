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
  it("塊の種類は節をまたいで重複を畳んだ集合にする", () => {
    const event = reportOfSections([
      {
        heading: "架空の節1",
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
        blocks: [{ kind: "text", text: "架空の根拠その2。", fold: "", aside: "" }],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

    expect(entry.blockKinds).toEqual(["text", "table"])
  })

  it("dimension の塊を塊の種類として数え、前の値があれば dimensionBefore の欄を立てる", () => {
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

    const plain = reportUsageEntryOf(
      reportOfSections([{ heading: "", blocks: [dimension("")] }]),
      "claude-session-1",
      1_000,
      false,
    )
    const changed = reportUsageEntryOf(
      reportOfSections([{ heading: "", blocks: [dimension("12px")] }]),
      "claude-session-1",
      1_000,
      false,
    )

    expect(plain.blockKinds).toEqual(["dimension"])
    expect(plain.blockFields).toEqual([])
    expect(changed.blockFields).toEqual(["dimensionBefore"])
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
        sections: [{ heading: "", blocks: row.blocks }],
        task: row.task ? task : { kind: "none" },
      })
      const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

      expect([entry.hasModifiedFiles, entry.hasBeforeAfterOrImage, entry.forTask]).toEqual(
        row.expected,
      )
    }
  })

  it("image の塊を塊の種類として数え、逃げ道に書いた画像は塊のある記法として数える", () => {
    const event = reportOfSections([
      {
        heading: "",
        blocks: [
          {
            kind: "image",
            path: "架空/after.png",
            caption: "架空の画面",
            notes: [],
            fold: "",
            aside: "",
          },
          { kind: "markdown", markdown: "![架空](架空/before.png)", fold: "", aside: "" },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

    expect(entry.blockKinds).toEqual(["image", "markdown"])
    expect(entry.notations).toEqual(["image"])
    expect(entry.blockFields).toEqual([])
  })

  it("image の塊に notes があれば imageNotes の欄を立てる", () => {
    const event = reportOfSections([
      {
        heading: "",
        blocks: [
          {
            kind: "image",
            path: "架空/after.png",
            caption: "架空の画面",
            notes: ["左上の架空の帯"],
            fold: "",
            aside: "",
          },
        ],
      },
    ])

    expect(reportUsageEntryOf(event, "claude-session-1", 1_000, false).blockFields).toEqual([
      "imageNotes",
    ])
  })

  it("code の塊に marks があれば codeMarks の欄を立て、無ければ立てない", () => {
    const code = (marks: readonly { lines: string; label: string }[]): ReportSection => ({
      heading: "",
      blocks: [
        { kind: "code", language: "ts", path: "", source: "架空", marks, fold: "", aside: "" },
      ],
    })

    expect(
      reportUsageEntryOf(
        reportOfSections([code([{ lines: "1", label: "架空" }])]),
        "claude-session-1",
        1_000,
        false,
      ).blockFields,
    ).toEqual(["codeMarks"])
    expect(
      reportUsageEntryOf(reportOfSections([code([])]), "claude-session-1", 1_000, false)
        .blockFields,
    ).toEqual([])
  })

  it("既定の値でない塊の欄を、節をまたいで重複を畳んだ集合にする", () => {
    const event = reportOfSections([
      {
        heading: "架空の節1",
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
            ],
            fold: "",
            aside: "",
          },
        ],
      },
      {
        heading: "架空の節2",
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

  it("rest が空でない表は tableRest を数え、空白だけなら数えない", () => {
    const fieldsOf = (rest: string): readonly string[] =>
      reportUsageEntryOf(
        reportOfSections([
          {
            heading: "",
            blocks: [
              {
                kind: "table",
                title: "",
                columns: ["a", "b"],
                rows: [["1", "2"]],
                rest,
                fold: "",
                aside: "",
              },
            ],
          },
        ]),
        "claude-session-1",
        1_000,
        false,
      ).blockFields

    expect([fieldsOf("ほか 3 件"), fieldsOf(" ")]).toEqual([["tableRest"], []])
  })

  it("aside が空でない塊があれば blockAside を数え、空白だけなら数えない", () => {
    const fieldsOf = (aside: string): readonly string[] =>
      reportUsageEntryOf(
        reportOfSections([
          { heading: "", blocks: [{ kind: "text", text: "架空の本文。", fold: "", aside }] },
        ]),
        "claude-session-1",
        1_000,
        false,
      ).blockFields

    expect([fieldsOf("架空の出典"), fieldsOf(" ")]).toEqual([["blockAside"], []])
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

  it("表が無いレポートの shortTable は偽", () => {
    const entry = reportUsageEntryOf(reportOfSections([]), "claude-session-1", 1_000, false)

    expect(entry.shortTable).toBe(false)
  })

  it("stats の total を渡した回は statsTotal を数える", () => {
    const event = reportOfSections([
      {
        heading: "",
        blocks: [
          {
            kind: "stats",
            items: [
              { before: "", value: "1", total: "5", label: "架空の一", series: [], better: "" },
              { before: "", value: "2", total: "", label: "架空の二", series: [], better: "" },
            ],
            fold: "",
            aside: "",
          },
        ],
      },
    ])

    expect(reportUsageEntryOf(event, "claude-session-1", 1_000, false).blockFields).toEqual([
      "statsTotal",
    ])
  })

  it.each([
    ["series を渡した回は statsSeries", [1, 2, 3], "", ["statsSeries"]],
    ["better を渡した回は statsBetter", [], "up", ["statsBetter"]],
    ["どちらも無ければ数えない", [], "", []],
  ] as const)("stats の%sを数える", (_, series, better, expected) => {
    const event = reportOfSections([
      {
        heading: "",
        blocks: [
          {
            kind: "stats",
            items: [
              { before: "", value: "1", total: "", label: "架空の一", series: [...series], better },
              { before: "", value: "2", total: "", label: "架空の二", series: [], better: "" },
            ],
            fold: "",
            aside: "",
          },
        ],
      },
    ])

    expect(reportUsageEntryOf(event, "claude-session-1", 1_000, false).blockFields).toEqual(
      expected,
    )
  })

  it("逃げ道（markdown の塊）の外側に出た記法の種類を数える", () => {
    const event = reportOfSections([
      {
        heading: "架空の節",
        blocks: [
          { kind: "markdown", markdown: "- 架空の1つ目\n- 架空の2つ目", fold: "", aside: "" },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

    expect(entry.blockKinds).toEqual(["markdown"])
    expect(entry.notations).toEqual(["list"])
    expect(entry.containedNotations).toEqual([])
  })

  it("逃げ道の HTML の容れ物の中に出た記法の種類は、外の記法と分けて数える", () => {
    const event = reportOfSections([
      {
        heading: "架空の節",
        blocks: [
          {
            kind: "markdown",
            markdown: "<details><summary>架空の見出し</summary>\n\n- 架空の1つ目\n\n</details>",
            fold: "",
            aside: "",
          },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

    expect(entry.notations).toEqual([])
    expect(entry.containedNotations).toEqual(["list"])
  })

  it("塊の無い記法（cols/card・svg・dl・引用・区切り線・details）の種類を数える", () => {
    const event = reportOfSections([
      {
        heading: "架空の節",
        blocks: [
          {
            kind: "markdown",
            markdown: [
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
            fold: "",
            aside: "",
          },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

    expect(entry.escapeNotations).toEqual(["colsCard", "svg", "dl", "quote", "hr", "details"])
  })

  it("逃げ道に書いた chart のフェンスは塊のある記法として数える", () => {
    const event = reportOfSections([
      {
        heading: "架空の節",
        blocks: [{ kind: "markdown", markdown: "```chart\n{}\n```", fold: "", aside: "" }],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000, false)

    expect(entry.notations).toEqual(["chart"])
    expect(entry.escapeNotations).toEqual([])
  })

  it("知らない種類で境界で落とした塊の数と、渡した時刻・セッションIDをそのまま運ぶ", () => {
    const event = reportOfSections([], 2)

    const entry = reportUsageEntryOf(event, "claude-session-9", 12_345, false)

    expect(entry).toEqual({
      at: 12_345,
      sessionId: "claude-session-9",
      figure: { figureKind: "none", noneReason: "unrecorded" },
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
    })
  })

  describe("hasFigure", () => {
    const figureOf = (block: ReportBlock): boolean =>
      reportUsageEntryOf(
        reportOfSections([{ heading: "", blocks: [block] }]),
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
        reportOfSections([{ heading: "", blocks }]),
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
        reportOfSections([{ heading: "", blocks }]),
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

    it("graph も強調も無ければすべて 0", () => {
      const entry = entryOf([{ kind: "text", text: "架空の根拠。", fold: "", aside: "" }])

      expect([
        entry.emphasisCount,
        entry.graphEdgeCount,
        entry.graphUnlabeledEdgeCount,
        entry.graphNodeCount,
      ]).toEqual([0, 0, 0, 0])
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
      const event = reportOfSections([{ heading: "", blocks: [block] }])

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

  it("メインの Read で、拡張子が画像4形式のどれかなら真（大文字小文字は問わない）", () => {
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
