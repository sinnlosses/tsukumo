import { describe, expect, it } from "bun:test"

import {
  scoreChatEpisodes,
  type ChatEpisodeRecord,
} from "../../../../src/server/chat/core/chat-episode-score.ts"

// フィクスチャは手で書いた架空のエピソードだけ（実物の会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

const NOW = Temporal.Instant.from("2026-09-26T00:00:00+09:00")

function episode(
  overrides: Partial<ChatEpisodeRecord> & { readonly id: string },
): ChatEpisodeRecord {
  return {
    to: NOW.toString(),
    title: "架空の見出し",
    gist: "架空の要旨。",
    cues: [],
    weight: 2,
    ...overrides,
  }
}

describe("scoreChatEpisodes", () => {
  it("手がかり語・見出し・要旨のどれかに、語の言い換えを2文字の重なりでも拾う", () => {
    const episodes = [
      episode({
        id: "2026-09-25-1",
        title: "ねこの日記",
        gist: "今日はねこと遊んだ話。",
        cues: ["ねこ好き"],
      }),
    ]

    // 「こねこ」はどのフィールドにも文字どおりは含まれないが、「ねこ」の2文字が重なる。
    const found = scoreChatEpisodes(episodes, "こねこ", NOW, new Map())
    expect(found).toEqual([
      { id: "2026-09-25-1", title: "ねこの日記", gist: "今日はねこと遊んだ話。" },
    ])

    // まったく重ならない語は候補にしない（足切り）。
    const notFound = scoreChatEpisodes(episodes, "宇宙船", NOW, new Map())
    expect(notFound).toEqual([])
  })

  it("思い出した回数が多いほど新しさの下がり方が緩み、古いエピソードでも上位に来る", () => {
    const recentNeverRecalled = episode({
      id: "recent",
      title: "架空の話題",
      to: NOW.subtract({ hours: 10 * 24 }).toString(),
    })
    const oldButOftenRecalled = episode({
      id: "old",
      title: "架空の話題",
      to: NOW.subtract({ hours: 40 * 24 }).toString(),
    })

    // 一致・weight は揃えてあるので、並びの違いは新しさ（思い出した回数の効き方）だけで決まる。
    const withoutRecall = scoreChatEpisodes(
      [recentNeverRecalled, oldButOftenRecalled],
      "架空",
      NOW,
      new Map(),
    )
    expect(withoutRecall.map((candidate) => candidate.id)).toEqual(["recent", "old"])

    const withRecall = scoreChatEpisodes(
      [recentNeverRecalled, oldButOftenRecalled],
      "架空",
      NOW,
      new Map([["old", 5]]),
    )
    expect(withRecall.map((candidate) => candidate.id)).toEqual(["old", "recent"])
  })
})
