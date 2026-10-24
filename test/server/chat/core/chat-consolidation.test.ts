import { describe, expect, it } from "vitest"

import type { ChatUnconsolidatedEntry } from "../../../../src/server/chat/core/chat-archive-port.ts"
import {
  CHAT_CONSOLIDATION_LIMITS,
  type ChatConsolidationResult,
  chatConsolidationQuery,
  chatSynopsisShrunk,
  parseChatConsolidationResult as parseResult,
  readChatTopics,
} from "../../../../src/server/chat/core/chat-consolidation.ts"
import { asidePromptText } from "../../../../src/server/session-driver/core/aside-prompt.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { fixedChatSummary, inMemoryChatSummary } from "../../../fixture/chat.ts"

/** 通れば検査を通った出力、落ちれば undefined。落ちた理由を見るテストは `parseResult` を直に呼ぶ。 */
function parseChatConsolidationResult(value: unknown): ChatConsolidationResult | undefined {
  const check = parseResult(value)
  return check.kind === "accepted" ? check.result : undefined
}

function rejectionOf(value: unknown): string | undefined {
  const check = parseResult(value)
  return check.kind === "rejected" ? check.rejection : undefined
}

// `queryChatConsolidation` 自体（本物の `query()` を起こす部分）は
// claude を子プロセスで起こすので、ここではテストしない。

const ENTRIES: readonly ChatUnconsolidatedEntry[] = [
  {
    at: "2026-09-20T10:00:00+09:00",
    kind: "request",
    origin: { mode: "chat" },
    text: "架空の発言1",
  },
  {
    at: "2026-09-20T10:01:00+09:00",
    kind: "speech",
    origin: { mode: "chat" },
    text: "架空の返事1",
  },
  {
    at: "2026-09-21T09:00:00+09:00",
    kind: "request",
    origin: { mode: "chat" },
    text: "架空の発言2",
  },
  {
    at: "2026-09-21T09:01:00+09:00",
    kind: "speech",
    origin: { mode: "chat" },
    text: "架空の返事2",
  },
]

const VALID_OUTPUT = {
  synopsis: "架空の書き直したあらすじ",
  topics: ["架空の話題1", "架空の話題2"],
} satisfies ChatConsolidationResult

describe("chatConsolidationQuery", () => {
  it("軽いモデルで、行番号つきの行・日付の見出し・前のあらすじを文面に載せる", () => {
    const query = chatConsolidationQuery({
      entries: ENTRIES,
      previousSynopsis: "架空の前のあらすじ",
    })

    expect(query.model).toBe("haiku")
    for (const fragment of [
      "### 2026-09-20",
      "1. 利用者: 架空の発言1",
      "2. あなた: 架空の返事1",
      "### 2026-09-21",
      "3. 利用者: 架空の発言2",
      "4. あなた: 架空の返事2",
      "架空の前のあらすじ",
    ]) {
      expect(query.prompt).toContain(fragment)
    }
  })

  it("仕事の行には印とプロジェクトの名前を添え、結論の行は「したこと」として渡す", () => {
    const origin = { mode: "work", project: "架空プロジェクト" } as const
    const query = chatConsolidationQuery({
      entries: [
        { at: "2026-09-22T10:00:00+09:00", kind: "request", origin, text: "架空の依頼" },
        { at: "2026-09-22T10:05:00+09:00", kind: "conclusion", origin, text: "架空の結論" },
      ],
      previousSynopsis: "",
    })

    expect(query.prompt).toContain("1. [仕事: 架空プロジェクト] 利用者: 架空の依頼")
    expect(query.prompt).toContain("2. [仕事: 架空プロジェクト] したこと: 架空の結論")
  })

  it("指示文は「雑談の会話」と言わず、印の読み方を添える", () => {
    const query = chatConsolidationQuery({ entries: ENTRIES, previousSynopsis: "" })

    expect(query.systemPrompt).not.toContain("雑談の会話")
    expect(query.systemPrompt).toContain("したこと:")
    expect(query.systemPrompt).toContain("[仕事: <プロジェクト名>]")
  })

  it("前のあらすじが空文字なら「（なし）」を載せる", () => {
    const query = chatConsolidationQuery({ entries: ENTRIES, previousSynopsis: "" })

    expect(query.prompt).toContain("## 前のあらすじ\n\n（なし）")
  })

  it("出力の形は json_schema で、synopsis / topics だけを持つ", () => {
    const query = chatConsolidationQuery({ entries: ENTRIES, previousSynopsis: "" })

    expect(query.schema).toMatchObject({
      type: "object",
      required: ["synopsis", "topics"],
      properties: {
        synopsis: { type: "string", minLength: 1, maxLength: CHAT_MEMORY_BUDGET.synopsisBytes },
        topics: { type: "array", maxItems: CHAT_CONSOLIDATION_LIMITS.topicsMax },
      },
    })
    expect(Object.keys(query.schema["properties"] ?? {})).toEqual(["synopsis", "topics"])
  })
})

describe("parseChatConsolidationResult", () => {
  it("形の整った出力を受け取る", () => {
    expect(parseChatConsolidationResult(VALID_OUTPUT)).toEqual(VALID_OUTPUT)
  })

  it("形の崩れは丸ごと undefined", () => {
    for (const value of [
      undefined,
      "架空の文字列",
      {},
      { ...VALID_OUTPUT, synopsis: 1 },
      { ...VALID_OUTPUT, topics: "架空" },
    ]) {
      expect(parseChatConsolidationResult(value)).toBeUndefined()
    }
  })

  it("synopsis は空・空白だけだと undefined。前後の空白は落とす", () => {
    expect(parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: "" })).toBeUndefined()
    expect(parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: " \n " })).toBeUndefined()
    expect(
      parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: "  架空の地の文\n" })?.synopsis,
    ).toBe("架空の地の文")
  })

  it("synopsis は synopsisBytes（UTF-8）を超えると undefined。ちょうどは通る", () => {
    const limit = CHAT_MEMORY_BUDGET.synopsisBytes
    expect(
      parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: "a".repeat(limit) }),
    ).toBeDefined()
    expect(
      parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: "a".repeat(limit + 1) }),
    ).toBeUndefined()
    // 文字数は上限未満でも、3バイト文字でバイト数が超える。
    expect(
      parseChatConsolidationResult({
        ...VALID_OUTPUT,
        synopsis: "あ".repeat(Math.floor(limit / 3) + 1),
      }),
    ).toBeUndefined()
  })

  it("synopsis に予約タグが含まれると undefined。予約タグは脇の話の包み・委譲の引き継ぎの頭・古い話題の組を網羅する", () => {
    const [asideOpen = "", ...asideRest] = asidePromptText("架空").split("架空")
    const asideClose = asideRest.join("").trim()
    // 引き継ぎの頭・スラッシュコマンドの展開は非公開の定数、Claude Code の印はコードに定数が無い。
    // リテラルで照らすので、向こうの変更は検知できない。
    for (const tag of [
      asideOpen.trim(),
      asideClose,
      "<tsukumo-progress>",
      "</tsukumo-progress>",
      "<agent-message",
      "<topics>",
      "</topics>",
      "<command-name>",
      "<command-message>",
      "<command-args>",
      "<system-reminder>",
      "</system-reminder>",
      "<task-notification>",
      "</task-notification>",
      "<local-command-stdout>",
    ]) {
      expect(
        parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: `架空の前${tag}架空の後` }),
      ).toBeUndefined()
    }
  })

  it("落ちた理由を種類で返す", () => {
    expect(rejectionOf("架空")).toBe("shape-structure")
    expect(rejectionOf({ ...VALID_OUTPUT, topics: "架空" })).toBe("shape-structure")
    expect(rejectionOf({ ...VALID_OUTPUT, topics: ["架空1", "架空2", "架空3", "架空4"] })).toBe(
      "shape-topics",
    )
    expect(rejectionOf({ ...VALID_OUTPUT, topics: [1] })).toBe("shape-topics")
    expect(rejectionOf({ ...VALID_OUTPUT, synopsis: " " })).toBe("synopsis-empty")
    expect(
      rejectionOf({
        ...VALID_OUTPUT,
        synopsis: "a".repeat(CHAT_MEMORY_BUDGET.synopsisBytes + 1),
      }),
    ).toBe("synopsis-too-long")
    expect(rejectionOf({ ...VALID_OUTPUT, synopsis: "架空<system-reminder>架空" })).toBe(
      "synopsis-reserved-tag",
    )
  })

  it("欠陥のあらゆる組み合わせで、形 → 空 → 予約タグ → 長すぎ → 話題の順の最初の理由を返す", () => {
    const structures = [
      { rejection: undefined, topics: ["架空1", "架空2", "架空3", "架空4"] },
      { rejection: "shape-structure", topics: "架空" },
    ] as const
    const synopses = [
      { rejection: undefined, text: VALID_OUTPUT.synopsis },
      { rejection: "synopsis-empty", text: " " },
      { rejection: "synopsis-reserved-tag", text: "架空<system-reminder>架空" },
      { rejection: "synopsis-too-long", text: "a".repeat(CHAT_MEMORY_BUDGET.synopsisBytes + 1) },
    ] as const
    for (const structure of structures) {
      for (const synopsis of synopses) {
        for (const topicsBroken of [false, true]) {
          const topics =
            structure.rejection === undefined && !topicsBroken ? ["架空1"] : structure.topics
          const expected =
            structure.rejection ?? synopsis.rejection ?? (topicsBroken ? "shape-topics" : undefined)
          expect(rejectionOf({ synopsis: synopsis.text, topics })).toBe(expected)
        }
      }
    }
  })

  it("縮みはここでは見ず、chatSynopsisShrunk が前のあらすじの半分未満のバイト数を縮みすぎとする。前のあらすじが短いときは比べない", () => {
    const previous = "あ".repeat(CHAT_CONSOLIDATION_LIMITS.synopsisCompareMinChars)
    const half = "あ".repeat(CHAT_CONSOLIDATION_LIMITS.synopsisCompareMinChars / 2)
    expect(chatSynopsisShrunk(half, previous)).toBe(false)
    expect(chatSynopsisShrunk(half.slice(1), previous)).toBe(true)
    const short = "あ".repeat(CHAT_CONSOLIDATION_LIMITS.synopsisCompareMinChars - 1)
    expect(chatSynopsisShrunk("あ", short)).toBe(false)
  })

  it("topics は上限件数・上限文字数を超えると undefined。0件は許す", () => {
    expect(
      parseChatConsolidationResult({
        ...VALID_OUTPUT,
        topics: Array.from({ length: 4 }, () => "架空"),
      }),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult({ ...VALID_OUTPUT, topics: ["あ".repeat(41)] }),
    ).toBeUndefined()
    expect(parseChatConsolidationResult({ ...VALID_OUTPUT, topics: [] })).toEqual({
      ...VALID_OUTPUT,
      topics: [],
    })
  })
})

describe("readChatTopics", () => {
  function topicsOf(topics: readonly string[]): readonly string[] {
    const chatSummary = inMemoryChatSummary(undefined)
    chatSummary.write("架空のあらすじ", topics, "2026-09-20T10:00:00+09:00")
    return readChatTopics(chatSummary)
  }

  it("写しの見出しを、書かれた順（新しい順）のまま返す", () => {
    expect(topicsOf(["架空の新しい話題", "架空の二番目の話題"])).toEqual([
      "架空の新しい話題",
      "架空の二番目の話題",
    ])
  })

  it("3件を超えて書かれていても、先頭から3件だけ", () => {
    expect(topicsOf(["架空1", "架空2", "架空3", "架空4"])).toEqual(["架空1", "架空2", "架空3"])
  })

  it("写しがまだ無い（一度も定着していない）ときは空", () => {
    expect(readChatTopics(fixedChatSummary(undefined))).toEqual([])
  })
})
