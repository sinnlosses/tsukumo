import { describe, expect, it } from "bun:test"

import { takeChatSummaryPromptPart } from "../../../src/server/core/chat-summary-prompt.ts"
import {
  type ChatSummary,
  type ChatSummaryRecord,
} from "../../../src/server/core/session-driver.ts"

// フィクスチャは手で書いた架空の要約だけ（実物の会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const SUMMARY = "利用者と最近読んだ本の話をした。次は続きの巻の感想を聞きたがっていた。"

/** メモリ上の `ChatSummary`（テスト用）。呼ばれた回数も数える。 */
function fakeChatSummary(initial: ChatSummaryRecord | undefined): ChatSummary & {
  readonly markDeliveredCalls: () => number
} {
  let record = initial
  let markDeliveredCount = 0
  return {
    read: () => record,
    write: (summary) => {
      record = { summary, delivered: true }
    },
    markUndelivered: () => {
      record = { summary: record?.summary ?? "", delivered: false }
    },
    markDelivered: () => {
      markDeliveredCount += 1
      record = { summary: record?.summary ?? "", delivered: true }
    },
    markDeliveredCalls: () => markDeliveredCount,
  }
}

describe("takeChatSummaryPromptPart", () => {
  it("新規の雑談（resume が undefined）では載る。載せたら印が「渡し済み」に戻る", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    const part = takeChatSummaryPromptPart(undefined, chatSummary)

    expect(part).toContain(SUMMARY)
    expect(chatSummary.markDeliveredCalls()).toBe(1)
    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })
  })

  it("resume では載らない（写しの印が「渡し済み」のとき）", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: true })

    const part = takeChatSummaryPromptPart("session-1", chatSummary)

    expect(part).toBeUndefined()
    expect(chatSummary.markDeliveredCalls()).toBe(0)
  })

  it("`/clear` を見たあとの resume（印が「未渡し」）では載る", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    const part = takeChatSummaryPromptPart("session-1", chatSummary)

    expect(part).toContain(SUMMARY)
    expect(chatSummary.markDeliveredCalls()).toBe(1)
  })

  it("載せたあとの resume では載らない（新規で載せた直後に起こし直した場合）", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })
    // 新規の雑談で1回載る。
    takeChatSummaryPromptPart(undefined, chatSummary)

    // 同じセッションを resume で起こし直す。
    const part = takeChatSummaryPromptPart("session-1", chatSummary)

    expect(part).toBeUndefined()
    expect(chatSummary.markDeliveredCalls()).toBe(1)
  })

  it("仕事のとき（chatSummary が undefined）は resume の値によらず載らない。読みも書きも起きない", () => {
    expect(takeChatSummaryPromptPart(undefined, undefined)).toBeUndefined()
    expect(takeChatSummaryPromptPart("session-1", undefined)).toBeUndefined()
  })

  it("写しが無い（read が undefined を返す）ときは新規でも載らない", () => {
    const chatSummary = fakeChatSummary(undefined)

    expect(takeChatSummaryPromptPart(undefined, chatSummary)).toBeUndefined()
    expect(chatSummary.markDeliveredCalls()).toBe(0)
  })

  it("印が無い・読めないときは「未渡し」として扱う（resume でも載る）", () => {
    // read() が印を持たない記録（delivered: false）を返す状態は、ファイルが無い・
    // 印の1行目が壊れているときと同じ扱いになる（adapter 側の畳み込み。
    // test/server/adapter/chat-summary.test.ts の「印が無い・読めないとき」）。
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    expect(takeChatSummaryPromptPart("session-1", chatSummary)).toContain(SUMMARY)
  })

  it("印の行が systemPrompt に混ざらない", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    const part = takeChatSummaryPromptPart(undefined, chatSummary)

    expect(part).not.toContain("delivered")
    expect(part).not.toContain("undelivered")
  })
})
