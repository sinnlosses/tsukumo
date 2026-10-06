import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../../src/server/report/core/report-usage.ts"
import type { ReportBlock, ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

function reportEvent(
  sections: readonly ReportSection[],
  unknownBlockCount = 0,
): Extract<SessionEvent, { readonly kind: "report" }> {
  return {
    kind: "report",
    toolUseId: "toolu_r1",
    conclusion: "架空の結論。",
    sections,
    favor: "",
    checks: [],
    closing: { kind: "none" },
    waitingLine: { kind: "none" },
    unknownBlockCount,
    sessionSummary: undefined,
    task: { kind: "none" },
    workPlanClosing: "none",
  }
}

describe("reportUsageEntryOf", () => {
  it("塊の種類は節をまたいで重複を畳んだ集合にする", () => {
    const event = reportEvent([
      {
        heading: "架空の節1",
        blocks: [
          { kind: "text", text: "架空の根拠。", fold: "" },
          { kind: "table", title: "", columns: ["a", "b"], rows: [["1", "2"]], fold: "" },
        ],
      },
      {
        heading: "架空の節2",
        blocks: [{ kind: "text", text: "架空の根拠その2。", fold: "" }],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

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
    })

    const plain = reportUsageEntryOf(
      reportEvent([{ heading: "", blocks: [dimension("")] }]),
      "claude-session-1",
      1_000,
    )
    const changed = reportUsageEntryOf(
      reportEvent([{ heading: "", blocks: [dimension("12px")] }]),
      "claude-session-1",
      1_000,
    )

    expect(plain.blockKinds).toEqual(["dimension"])
    expect(plain.blockFields).toEqual([])
    expect(changed.blockFields).toEqual(["dimensionBefore"])
  })

  it("image の塊を塊の種類として数え、逃げ道に書いた画像は塊のある記法として数える", () => {
    const event = reportEvent([
      {
        heading: "",
        blocks: [
          { kind: "image", path: "架空/after.png", caption: "架空の画面", notes: [], fold: "" },
          { kind: "markdown", markdown: "![架空](架空/before.png)", fold: "" },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

    expect(entry.blockKinds).toEqual(["image", "markdown"])
    expect(entry.notations).toEqual(["image"])
    expect(entry.blockFields).toEqual([])
  })

  it("image の塊に notes があれば imageNotes の欄を立てる", () => {
    const event = reportEvent([
      {
        heading: "",
        blocks: [
          {
            kind: "image",
            path: "架空/after.png",
            caption: "架空の画面",
            notes: ["左上の架空の帯"],
            fold: "",
          },
        ],
      },
    ])

    expect(reportUsageEntryOf(event, "claude-session-1", 1_000).blockFields).toEqual(["imageNotes"])
  })

  it("既定の値でない塊の欄を、節をまたいで重複を畳んだ集合にする", () => {
    const event = reportEvent([
      {
        heading: "架空の節1",
        blocks: [
          {
            kind: "table",
            title: "",
            columns: ["a", "b"],
            rows: [["架空の", { from: "1", to: "2" }]],
            fold: "",
          },
          {
            kind: "stats",
            items: [
              { before: "", value: "1", total: "", label: "架空の一" },
              { before: "", value: "2", total: "", label: "架空の二" },
            ],
            fold: "",
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
          },
          {
            kind: "table",
            title: "",
            columns: ["a", "b"],
            rows: [["架空の", { from: "3", to: "4" }]],
            fold: "",
          },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

    expect(entry.blockFields).toEqual(["tableChange", "listLabel", "listFlow"])
  })

  it("stats の total を渡した回は statsTotal を数える", () => {
    const event = reportEvent([
      {
        heading: "",
        blocks: [
          {
            kind: "stats",
            items: [
              { before: "", value: "1", total: "5", label: "架空の一" },
              { before: "", value: "2", total: "", label: "架空の二" },
            ],
            fold: "",
          },
        ],
      },
    ])

    expect(reportUsageEntryOf(event, "claude-session-1", 1_000).blockFields).toEqual(["statsTotal"])
  })

  it("逃げ道（markdown の塊）の外側に出た記法の種類を数える", () => {
    const event = reportEvent([
      {
        heading: "架空の節",
        blocks: [{ kind: "markdown", markdown: "- 架空の1つ目\n- 架空の2つ目", fold: "" }],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

    expect(entry.blockKinds).toEqual(["markdown"])
    expect(entry.notations).toEqual(["list"])
    expect(entry.containedNotations).toEqual([])
  })

  it("逃げ道の HTML の容れ物の中に出た記法の種類は、外の記法と分けて数える", () => {
    const event = reportEvent([
      {
        heading: "架空の節",
        blocks: [
          {
            kind: "markdown",
            markdown: "<details><summary>架空の見出し</summary>\n\n- 架空の1つ目\n\n</details>",
            fold: "",
          },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

    expect(entry.notations).toEqual([])
    expect(entry.containedNotations).toEqual(["list"])
  })

  it("塊の無い記法（cols/card・svg・dl・引用・区切り線・details）の種類を数える", () => {
    const event = reportEvent([
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
          },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

    expect(entry.escapeNotations).toEqual(["colsCard", "svg", "dl", "quote", "hr", "details"])
  })

  it("逃げ道に書いた chart のフェンスは塊のある記法として数える", () => {
    const event = reportEvent([
      {
        heading: "架空の節",
        blocks: [{ kind: "markdown", markdown: "```chart\n{}\n```", fold: "" }],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

    expect(entry.notations).toEqual(["chart"])
    expect(entry.escapeNotations).toEqual([])
  })

  it("知らない種類で境界で落とした塊の数と、渡した時刻・セッションIDをそのまま運ぶ", () => {
    const event = reportEvent([], 2)

    const entry = reportUsageEntryOf(event, "claude-session-9", 12_345)

    expect(entry).toEqual({
      at: 12_345,
      sessionId: "claude-session-9",
      blockKinds: [],
      blockFields: [],
      notations: [],
      containedNotations: [],
      escapeNotations: [],
      unknownBlockCount: 2,
    })
  })
})
