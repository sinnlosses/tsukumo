import { describe, expect, it } from "bun:test"

import {
  CHAT_CONSOLIDATION_LIMITS,
  CHAT_CONSOLIDATION_MODEL,
  type ChatConsolidationResult,
  chatConsolidationQuery,
  chatEpisodeDrafts,
  parseChatConsolidationResult,
} from "../../../../src/server/chat/core/chat-consolidation.ts"
import { type ChatUnconsolidatedEntry } from "../../../../src/server/session-driver/core/session-driver.ts"

// 畳む行・あらすじ・エピソードはすべて手で書いた架空のもの（docs/coding-standards.md
// 「会話内容の扱い」）。`queryChatConsolidation` 自体（本物の `query()` を起こす部分）は
// claude を子プロセスで起こすので、ここではテストしない（`sdk-diary.test.ts` の先例と同じ扱い）。

const ENTRIES: readonly ChatUnconsolidatedEntry[] = [
  { at: "2026-09-20T10:00:00+09:00", speaker: "user", text: "架空の発言1" },
  { at: "2026-09-20T10:01:00+09:00", speaker: "character", text: "架空の返事1" },
  { at: "2026-09-21T09:00:00+09:00", speaker: "user", text: "架空の発言2" },
  { at: "2026-09-21T09:01:00+09:00", speaker: "character", text: "架空の返事2" },
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

    expect(query.model).toBe(CHAT_CONSOLIDATION_MODEL)
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

  it("1件のエピソードが1行だけを覆うとき、from と to は同じ行を指す", () => {
    const single: readonly ChatUnconsolidatedEntry[] = [
      { at: "2026-09-20T10:00:00+09:00", speaker: "user", text: "架空の発言1" },
    ]
    const episode = { end: 1, title: "架空", gist: "架空", cues: ["架空"], weight: 1 as const }

    expect(chatEpisodeDrafts(single, [episode])).toEqual([
      {
        from: "2026-09-20T10:00:00+09:00",
        to: "2026-09-20T10:00:00+09:00",
        title: "架空",
        gist: "架空",
        cues: ["架空"],
        weight: 1,
      },
    ])
  })
})
