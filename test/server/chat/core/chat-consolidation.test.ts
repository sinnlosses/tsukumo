import { describe, expect, it } from "vitest"

import type { ChatUnconsolidatedEntry } from "../../../../src/server/chat/core/chat-archive-port.ts"
import {
  CHAT_CONSOLIDATION_LIMITS,
  type ChatConsolidationResult,
  CHAT_TOPIC_LIMIT,
  chatConsolidationQuery,
  chatEpisodeDrafts,
  chatSynopsisShrunk,
  CHAT_SYNOPSIS_RESERVED_TAGS,
  parseChatConsolidationResult as parseResult,
  readChatTopics,
} from "../../../../src/server/chat/core/chat-consolidation.ts"
import { asidePromptText } from "../../../../src/server/session-driver/core/aside-prompt.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { fixedChatSummary, inMemoryChatSummary } from "../../../fixture/chat.ts"

/** 通れば検査を通った出力、落ちれば undefined。落ちた理由を見るテストは `parseResult` を直に呼ぶ。 */
function parseChatConsolidationResult(
  value: unknown,
  lineCount: number,
): ChatConsolidationResult | undefined {
  const check = parseResult(value, lineCount)
  return check.kind === "accepted" ? check.result : undefined
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
  episodes: [
    { end: 2, title: "架空の見出し1", gist: "架空の要旨1", cues: ["架空の手がかり"], weight: 2 },
    { end: 4, title: "架空の見出し2", gist: "架空の要旨2", cues: ["架空の手がかり2"], weight: 1 },
  ],
  synopsis: "架空の書き直したあらすじ",
  topics: ["架空の話題1", "架空の話題2"],
} satisfies ChatConsolidationResult

describe("chatConsolidationQuery", () => {
  it("軽いモデルで、行番号つきの行・日付の見出し・前のあらすじ・直前の見出しを文面に載せる", () => {
    const query = chatConsolidationQuery({
      entries: ENTRIES,
      previousSynopsis: "架空の前のあらすじ",
      previousEpisodeTitle: "架空の直前の見出し",
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
      "架空の直前の見出し",
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
      previousEpisodeTitle: "",
    })

    expect(query.prompt).toContain("1. [仕事: 架空プロジェクト] 利用者: 架空の依頼")
    expect(query.prompt).toContain("2. [仕事: 架空プロジェクト] したこと: 架空の結論")
  })

  it("指示文は「雑談の会話」と言わず、印の読み方を添える", () => {
    const query = chatConsolidationQuery({
      entries: ENTRIES,
      previousSynopsis: "",
      previousEpisodeTitle: "",
    })

    expect(query.systemPrompt).not.toContain("雑談の会話")
    expect(query.systemPrompt).toContain("したこと:")
    expect(query.systemPrompt).toContain("[仕事: <プロジェクト名>]")
  })

  it("前のあらすじ・直前の見出しが空文字なら「（なし）」を載せる", () => {
    const query = chatConsolidationQuery({
      entries: ENTRIES,
      previousSynopsis: "",
      previousEpisodeTitle: "",
    })

    expect(query.prompt).toContain("## 前のあらすじ\n\n（なし）")
    expect(query.prompt).toContain("## 直前のエピソードの見出し\n\n（なし）")
  })

  it("出力の形は json_schema で、episodes / synopsis / topics を持つ", () => {
    const query = chatConsolidationQuery({
      entries: ENTRIES,
      previousSynopsis: "",
      previousEpisodeTitle: "",
    })

    expect(query.schema).toMatchObject({
      type: "object",
      required: ["episodes", "synopsis", "topics"],
      properties: {
        episodes: { type: "array", minItems: 1 },
        synopsis: { type: "string", minLength: 1, maxLength: CHAT_MEMORY_BUDGET.synopsisBytes },
        topics: { type: "array", maxItems: CHAT_CONSOLIDATION_LIMITS.topicsMax },
      },
    })
  })
})

describe("parseChatConsolidationResult", () => {
  it("行を切れ目なく覆う形の整った出力を受け取る", () => {
    expect(parseChatConsolidationResult(VALID_OUTPUT, ENTRIES.length)).toEqual(VALID_OUTPUT)
  })

  it("前後の空白を落とす", () => {
    const padded = {
      ...VALID_OUTPUT,
      episodes: [
        { ...VALID_OUTPUT.episodes[0], title: "  架空の見出し1  " },
        VALID_OUTPUT.episodes[1],
      ],
    }
    const result = parseChatConsolidationResult(padded, ENTRIES.length)
    expect(result?.episodes[0]?.title).toBe("架空の見出し1")
  })

  it("形の崩れは丸ごと undefined", () => {
    const [first, second] = VALID_OUTPUT.episodes
    for (const value of [
      undefined,
      "架空の文字列",
      {},
      { ...VALID_OUTPUT, episodes: "架空" },
      { ...VALID_OUTPUT, episodes: [] },
      { ...VALID_OUTPUT, synopsis: 1 },
      { ...VALID_OUTPUT, topics: "架空" },
    ]) {
      expect(parseChatConsolidationResult(value, ENTRIES.length)).toBeUndefined()
    }
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, episodes: [{ ...first, title: "" }, second] },
        ENTRIES.length,
      ),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, episodes: [{ ...first, title: "あ".repeat(21) }, second] },
        ENTRIES.length,
      ),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, episodes: [{ ...first, gist: "" }, second] },
        ENTRIES.length,
      ),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, episodes: [{ ...first, cues: [] }, second] },
        ENTRIES.length,
      ),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult(
        {
          ...VALID_OUTPUT,
          episodes: [{ ...first, cues: Array.from({ length: 11 }, () => "架空") }, second],
        },
        ENTRIES.length,
      ),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, episodes: [{ ...first, weight: 4 }, second] },
        ENTRIES.length,
      ),
    ).toBeUndefined()
  })

  it("end の重複・逆順・最後が行数と不一致は undefined（切れ目なく覆っていない）", () => {
    const [first, second] = VALID_OUTPUT.episodes
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, episodes: [first, { ...second, end: 2 }] },
        ENTRIES.length,
      ),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult(
        {
          ...VALID_OUTPUT,
          episodes: [
            { ...first, end: 4 },
            { ...second, end: 2 },
          ],
        },
        ENTRIES.length,
      ),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, episodes: [first, { ...second, end: 3 }] },
        ENTRIES.length,
      ),
    ).toBeUndefined()
  })

  it("synopsis は空・空白だけだと undefined。前後の空白は落とす", () => {
    expect(parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: "" }, 4)).toBeUndefined()
    expect(parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: " \n " }, 4)).toBeUndefined()
    expect(
      parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: "  架空の地の文\n" }, 4)?.synopsis,
    ).toBe("架空の地の文")
  })

  it("synopsis は synopsisBytes（UTF-8）を超えると undefined。ちょうどは通る", () => {
    const limit = CHAT_MEMORY_BUDGET.synopsisBytes
    expect(
      parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: "a".repeat(limit) }, 4),
    ).toBeDefined()
    expect(
      parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: "a".repeat(limit + 1) }, 4),
    ).toBeUndefined()
    // 文字数は上限未満でも、3バイト文字でバイト数が超える。
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, synopsis: "あ".repeat(Math.floor(limit / 3) + 1) },
        4,
      ),
    ).toBeUndefined()
  })

  it("synopsis に予約タグが含まれると undefined", () => {
    for (const tag of CHAT_SYNOPSIS_RESERVED_TAGS) {
      expect(
        parseChatConsolidationResult({ ...VALID_OUTPUT, synopsis: `架空の前${tag}架空の後` }, 4),
      ).toBeUndefined()
    }
  })

  it("予約タグは、脇の話の包み・委譲の引き継ぎの頭・古い話題の組を網羅する", () => {
    const tags: readonly string[] = CHAT_SYNOPSIS_RESERVED_TAGS
    const [asideOpen = "", ...asideRest] = asidePromptText("架空").split("架空")
    const asideClose = asideRest.join("").trim()
    expect(tags).toContain(asideOpen.trim())
    expect(tags).toContain(asideClose)
    // 引き継ぎの頭・スラッシュコマンドの展開は非公開の定数、Claude Code の印はコードに定数が無い。
    // リテラルで照らすので、向こうの変更は検知できない。
    for (const tag of [
      "<agent-message",
      "<topics>",
      "</topics>",
      "<command-name>",
      "<command-message>",
      "<command-args>",
      "<system-reminder>",
      "<task-notification>",
      "<local-command-stdout>",
    ]) {
      expect(tags).toContain(tag)
    }
  })

  it("落ちた理由を種類で返す", () => {
    const rejectionOf = (value: unknown): string | undefined => {
      const check = parseResult(value, ENTRIES.length)
      return check.kind === "rejected" ? check.rejection : undefined
    }
    expect(rejectionOf("架空")).toBe("shape-structure")
    expect(rejectionOf({ ...VALID_OUTPUT, topics: "架空" })).toBe("shape-structure")
    expect(rejectionOf({ ...VALID_OUTPUT, episodes: [{ end: 4 }] })).toBe("shape-episode")
    expect(rejectionOf({ ...VALID_OUTPUT, episodes: [] })).toBe("shape-coverage")
    expect(rejectionOf({ ...VALID_OUTPUT, episodes: [VALID_OUTPUT.episodes[0]] })).toBe(
      "shape-coverage",
    )
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

  it("縮みはここでは見ず、chatSynopsisShrunk が前のあらすじの半分未満のバイト数を縮みすぎとする。前のあらすじが短いときは比べない", () => {
    const previous = "あ".repeat(CHAT_CONSOLIDATION_LIMITS.gistChars)
    const half = "あ".repeat(CHAT_CONSOLIDATION_LIMITS.gistChars / 2)
    expect(chatSynopsisShrunk(half, previous)).toBe(false)
    expect(chatSynopsisShrunk(half.slice(1), previous)).toBe(true)
    const short = "あ".repeat(CHAT_CONSOLIDATION_LIMITS.gistChars - 1)
    expect(chatSynopsisShrunk("あ", short)).toBe(false)
  })

  it("topics は上限件数・上限文字数を超えると undefined。0件は許す", () => {
    expect(
      parseChatConsolidationResult(
        { ...VALID_OUTPUT, topics: Array.from({ length: 4 }, () => "架空") },
        ENTRIES.length,
      ),
    ).toBeUndefined()
    expect(
      parseChatConsolidationResult({ ...VALID_OUTPUT, topics: ["あ".repeat(41)] }, ENTRIES.length),
    ).toBeUndefined()
    expect(parseChatConsolidationResult({ ...VALID_OUTPUT, topics: [] }, ENTRIES.length)).toEqual({
      ...VALID_OUTPUT,
      topics: [],
    })
  })
})

describe("chatEpisodeDrafts", () => {
  it("行番号の区切りを、対応する行の at を使って from / to に直す", () => {
    const result = parseChatConsolidationResult(VALID_OUTPUT, ENTRIES.length)
    expect(result).toBeDefined()
    if (result === undefined) {
      return
    }

    expect(chatEpisodeDrafts(ENTRIES, result.episodes)).toEqual([
      {
        from: "2026-09-20T10:00:00+09:00",
        to: "2026-09-20T10:01:00+09:00",
        title: "架空の見出し1",
        gist: "架空の要旨1",
        cues: ["架空の手がかり"],
        weight: 2,
      },
      {
        from: "2026-09-21T09:00:00+09:00",
        to: "2026-09-21T09:01:00+09:00",
        title: "架空の見出し2",
        gist: "架空の要旨2",
        cues: ["架空の手がかり2"],
        weight: 1,
      },
    ])
  })
})

describe("chatEpisodeDrafts の weight の上限", () => {
  const at = (minute: number): string => `2026-09-20T10:0${String(minute)}:00+09:00`
  const work: ChatUnconsolidatedEntry["origin"] = { mode: "work", project: "架空の案件" }
  const chat: ChatUnconsolidatedEntry["origin"] = { mode: "chat" }
  const line = (minute: number, origin: ChatUnconsolidatedEntry["origin"]) =>
    ({ at: at(minute), kind: "request", origin, text: "架空" }) satisfies ChatUnconsolidatedEntry
  const episode = (end: number, weight: 1 | 2 | 3) => ({
    end,
    title: "架空",
    gist: "架空",
    cues: ["架空"],
    weight,
  })
  const weights = (
    entries: readonly ChatUnconsolidatedEntry[],
    episodes: readonly ReturnType<typeof episode>[],
  ): readonly number[] => chatEpisodeDrafts(entries, episodes).map((draft) => draft.weight)

  it("仕事の行だけの範囲の 3 は 2 に下げる。1 と 2 は変えない", () => {
    const entries = [line(0, work), line(1, work)]
    expect(weights(entries, [episode(2, 3)])).toEqual([2])
    expect(weights(entries, [episode(2, 2)])).toEqual([2])
    expect(weights(entries, [episode(2, 1)])).toEqual([1])
  })

  it("範囲の端が雑談の行なら 3 のまま。範囲が1行でも同じ", () => {
    expect(weights([line(0, chat), line(1, work)], [episode(2, 3)])).toEqual([3])
    expect(weights([line(0, work), line(1, chat)], [episode(2, 3)])).toEqual([3])
    expect(weights([line(0, chat)], [episode(1, 3)])).toEqual([3])
    expect(weights([line(0, work)], [episode(1, 3)])).toEqual([2])
  })

  it("エピソードごとに自分の範囲だけを見る（隣のエピソードの雑談の行は数えない）", () => {
    const entries = [line(0, chat), line(1, work), line(2, work)]
    expect(weights(entries, [episode(1, 3), episode(3, 3)])).toEqual([3, 2])
  })

  it("範囲が行の外・行が空なら、そのエピソードは飛ばす", () => {
    expect(weights([line(0, work)], [episode(5, 3)])).toEqual([])
    expect(weights([], [episode(1, 3)])).toEqual([])
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

  it(`${String(CHAT_TOPIC_LIMIT)}件を超えて書かれていても、先頭から${String(CHAT_TOPIC_LIMIT)}件だけ`, () => {
    expect(topicsOf(["架空1", "架空2", "架空3", "架空4"])).toEqual(["架空1", "架空2", "架空3"])
  })

  it("写しがまだ無い（一度も定着していない）ときは空", () => {
    expect(readChatTopics(fixedChatSummary(undefined))).toEqual([])
  })
})
