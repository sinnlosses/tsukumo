import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../../src/server/report/core/report-usage.ts"
import type { ReportSection } from "../../../../src/shared/report-block.ts"
import type { SessionEvent } from "../../../../src/shared/session-event.ts"

// 中身はすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
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

  it("逃げ道（markdown の塊）の中に出た記法の種類を数える", () => {
    const event = reportEvent([
      {
        heading: "架空の節",
        blocks: [{ kind: "markdown", markdown: "- 架空の1つ目\n- 架空の2つ目", fold: "" }],
      },
    ])

    const entry = reportUsageEntryOf(event, "claude-session-1", 1_000)

    expect(entry.blockKinds).toEqual(["markdown"])
    expect(entry.notations).toEqual(["list"])
  })

  it("知らない種類で境界で落とした塊の数と、渡した時刻・セッションIDをそのまま運ぶ", () => {
    const event = reportEvent([], 2)

    const entry = reportUsageEntryOf(event, "claude-session-9", 12_345)

    expect(entry).toEqual({
      at: 12_345,
      sessionId: "claude-session-9",
      blockKinds: [],
      notations: [],
      unknownBlockCount: 2,
    })
  })
})
