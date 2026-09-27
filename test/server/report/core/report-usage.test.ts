import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../../src/server/report/core/report-usage.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
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
    unknownBlockCount,
    sessionSummary: undefined,
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
              { before: "", value: "1", label: "架空の一" },
              { before: "", value: "2", label: "架空の二" },
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

  it("塊の無い記法（cols/card・chart・svg・dl・引用・区切り線・details）の種類を数える", () => {
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
              "",
              "```chart",
              "{}",
              "```",
            ].join("\n"),
            fold: "",
          },
        ],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

    expect(entry.escapeNotations).toEqual([
      "colsCard",
      "chart",
      "svg",
      "dl",
      "quote",
      "hr",
      "details",
    ])
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
      sessionSummary: undefined,
    })
  })
})
