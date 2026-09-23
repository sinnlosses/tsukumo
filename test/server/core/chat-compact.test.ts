import { describe, expect, it } from "bun:test"

import {
  CHAT_COMPACT_COMMAND,
  CHAT_TOPIC_LIMIT,
  chatTopics,
  readChatTopics,
} from "../../../src/server/core/chat-compact.ts"
import {
  type ChatSummary,
  type ChatSummaryRecord,
} from "../../../src/server/core/session-driver.ts"

// フィクスチャは手で書いた架空の要約だけ（実物の要約・会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。形は `/compact` が返す生の出力に寄せてある
// （`<analysis>` のあとに `<summary>`）。
const SUMMARY_WITH_TOPICS = [
  "<analysis>",
  "架空の考え。話題は3つあった。",
  "</analysis>",
  "",
  "<summary>",
  "1. Primary Request and Intent:",
  "   架空の雑談をした。",
  "",
  "<topics>",
  "- 架空の新しい話題",
  "- 架空の二番目の話題",
  "- 架空の三番目の話題",
  "</topics>",
  "</summary>",
].join("\n")

function fakeChatSummary(record: ChatSummaryRecord | undefined): ChatSummary {
  return {
    read: () => record,
    write: () => {},
    markUndelivered: () => {},
    markDelivered: () => {},
  }
}

describe("CHAT_COMPACT_COMMAND", () => {
  it("/compact に続けて、話題の見出しを挟む印を指定する", () => {
    expect(CHAT_COMPACT_COMMAND.startsWith("/compact ")).toBe(true)
    expect(CHAT_COMPACT_COMMAND).toContain("<topics>")
    expect(CHAT_COMPACT_COMMAND).toContain("</topics>")
  })

  it("依頼は1行に収める（引数として1つのまま渡る）", () => {
    expect(CHAT_COMPACT_COMMAND).not.toContain("\n")
  })
})

describe("chatTopics", () => {
  it("<topics> と </topics> の間の行を、書かれた順（新しい順）のまま取り出す", () => {
    expect(chatTopics(SUMMARY_WITH_TOPICS)).toEqual([
      "架空の新しい話題",
      "架空の二番目の話題",
      "架空の三番目の話題",
    ])
  })

  it(`${String(CHAT_TOPIC_LIMIT)}件を超えて書かれていても、先頭から${String(CHAT_TOPIC_LIMIT)}件だけ`, () => {
    const summary = ["<topics>", "- 架空1", "- 架空2", "- 架空3", "- 架空4", "</topics>"].join("\n")

    expect(chatTopics(summary)).toEqual(["架空1", "架空2", "架空3"])
  })

  it("箇条の印（- * ・ 1.）を落とし、空行は数えない", () => {
    const summary = ["<topics>", "* 架空A", "", "・架空B", "2. 架空C", "</topics>"].join("\n")

    expect(chatTopics(summary)).toEqual(["架空A", "架空B", "架空C"])
  })

  it("同じ行に閉じまで書かれていても取り出す", () => {
    expect(chatTopics("<topics>- 架空の話題</topics>")).toEqual(["架空の話題"])
  })

  it("組が2つあるときは最後の組を読む（考えの下書きより要約の本文を優先する）", () => {
    const summary = [
      "<analysis>",
      "<topics>",
      "- 下書きの架空の話題",
      "</topics>",
      "</analysis>",
      "<summary>",
      "<topics>",
      "- 本文の架空の話題",
      "</topics>",
      "</summary>",
    ].join("\n")

    expect(chatTopics(summary)).toEqual(["本文の架空の話題"])
  })

  it("印が無い要約（見出しの節を書かなかった）からは何も出さない", () => {
    expect(chatTopics("架空の要約。話題の節は無い。")).toEqual([])
  })

  it("閉じの印が無い（途中で切れた）ときは何も出さない", () => {
    expect(chatTopics("<topics>\n- 架空の話題\n")).toEqual([])
  })

  it("空の文字列からは何も出さない", () => {
    expect(chatTopics("")).toEqual([])
  })
})

describe("readChatTopics", () => {
  it("写しの本文から見出しを取り出す", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY_WITH_TOPICS, delivered: true })

    expect(readChatTopics(chatSummary)).toEqual([
      "架空の新しい話題",
      "架空の二番目の話題",
      "架空の三番目の話題",
    ])
  })

  it("写しがまだ無い（一度も圧縮していない）ときは空", () => {
    expect(readChatTopics(fakeChatSummary(undefined))).toEqual([])
  })
})
