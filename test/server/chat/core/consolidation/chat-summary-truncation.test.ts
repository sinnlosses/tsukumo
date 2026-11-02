import { describe, expect, it } from "vitest"

import { truncatedSummary } from "../../../../../src/server/chat/core/consolidation/chat-summary-truncation.ts"

describe("truncatedSummary", () => {
  it("収まるなら全文をそのまま返す", () => {
    expect(truncatedSummary("一\n二\n三", 100)).toEqual({ text: "一\n二\n三", droppedLines: 0 })
  })

  it("溢れるときは古い行から落とし、行の途中では切らない", () => {
    // 1 行は 3 バイト、改行は 1 バイト。7 バイトなら 2 行まで入る。
    expect(truncatedSummary("一\n二\n三", 7)).toEqual({ text: "二\n三", droppedLines: 1 })
    expect(truncatedSummary("一\n二\n三", 6)).toEqual({ text: "三", droppedLines: 2 })
  })

  it("1行だけで上限を超えるときはその1行を残す", () => {
    expect(truncatedSummary("架空の長い一行", 3)).toEqual({
      text: "架空の長い一行",
      droppedLines: 0,
    })
  })

  it("最後の行だけが上限を超えるときも、その行は残す", () => {
    expect(truncatedSummary("短\n架空の長い一行", 3)).toEqual({
      text: "架空の長い一行",
      droppedLines: 1,
    })
  })
})
