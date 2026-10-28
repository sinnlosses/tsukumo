import { describe, expect, it } from "vitest"

import {
  isMainImageFileRead,
  reportUsageEntryOf,
} from "../../../../src/server/report/core/report-usage.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import type { ReportCheck } from "../../../../src/shared/report/report-check.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent, reportOfDrawn, reportOfSections } from "../../../fixture/report-event.ts"

describe("reportUsageEntryOf", () => {
  it("hasModifiedFiles は常に false で、前後図か画像の有無・task の有無を塊の欄とは別の真偽値で持つ", () => {
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
      { blocks: [files("modified")], task: false, expected: [false, false, false] },
      { blocks: [files("modified")], task: true, expected: [false, false, true] },
      { blocks: [files("modified"), beforeAfter], task: false, expected: [false, true, false] },
      { blocks: [files("modified"), image], task: true, expected: [false, true, true] },
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
          legend: [],
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
          legend: [],
          fold: "",
          aside: "",
        }),
      ).toBe(true)
      expect(
        figureOf(
          beforeAfterOf(
            { kind: "svg", width: 10, height: 10, shapes: [svgShape], legend: [] },
            codeSide,
          ),
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
            {
              label: "",
              text: "**一**と**二**",
              done: false,
              source: "",
              branch: "",
              branchTone: "warn",
            },
            {
              label: "",
              text: "なし",
              done: false,
              source: "",
              branch: "**分岐**",
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
          rows: [["**甲**", { status: "ok", text: "**乙**" }, { from: "**前**", to: "後" }]],
          rest: "",
          fold: "",
          aside: "",
        },
      ])

      expect(entry.emphasisCount).toBe(7)
    })

    it("graph が2つあれば辺とラベルの無い辺を合計し、節点数は多いほうにする", () => {
      const graph = (source: string): ReportBlock => ({
        kind: "graph",
        title: "",
        direction: "TD",
        legend: [],
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

    it("unobserved が無ければ両方偽、全部に確かめ方があれば両方真、1つでも空なら確かめ方は偽", () => {
      expect(flagsOf([])).toEqual([false, false])
      expect(flagsOf([check("ok", ""), check("ng", "")])).toEqual([false, false])
      expect(
        flagsOf([check("unobserved", "架空の窓を開く"), check("unobserved", "架空の札を見る")]),
      ).toEqual([true, true])
      expect(flagsOf([check("unobserved", "架空の窓を開く"), check("unobserved", " ")])).toEqual([
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
          items: [
            {
              label: "",
              text: "src/a.ts:12 で読む",
              done: false,
              source: "",
              branch: "",
              branchTone: "warn",
            },
          ],
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
        reportOfDrawn({ figure: image }),
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
