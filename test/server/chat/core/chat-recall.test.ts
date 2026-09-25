import { describe, expect, it } from "bun:test"

import { createChatRecall } from "../../../../src/server/chat/core/chat-recall.ts"
import {
  type ChatArchive,
  type ChatEpisodeRecallListResult,
  type ChatEpisodeReadResult,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { type ChatMemoryBudget } from "../../../../src/shared/chat-memory-budget.ts"

// フィクスチャは手で書いた架空の候補・逐語だけ（実物の会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

const BUDGET: ChatMemoryBudget = {
  recentBytes: 1024,
  synopsisBytes: 1024,
  recallListBytes: 64,
  recallListsPerTurn: 2,
  recallEpisodeBytes: 128,
  recallEpisodesPerTurn: 2,
  consolidateEveryBytes: 1024,
}

const FOUND_LIST: ChatEpisodeRecallListResult = {
  kind: "found",
  candidates: [{ id: "2026-09-25-1", title: "架空の見出し", gist: "架空の要旨。" }],
}

const FOUND_EPISODE: ChatEpisodeReadResult = {
  kind: "found",
  entries: [{ speaker: "user", text: "架空のやり取り", date: "2026-09-25" }],
  overflowed: false,
}

/** 呼ばれた引数と回数を覚える `ChatArchive`（テスト用。`recallList` / `recallEpisode` 以外は使わない）。 */
function fakeChatArchive(): ChatArchive & {
  readonly recallListCalls: () => readonly unknown[]
  readonly recallEpisodeCalls: () => readonly unknown[]
} {
  const recallListCalls: unknown[] = []
  const recallEpisodeCalls: unknown[] = []
  return {
    append: () => {},
    readRecent: () => ({ kept: [], recent: [] }),
    unconsolidated: () => ({ entries: [], usedBytes: 0, previousEpisodeTitle: "" }),
    appendEpisodes: () => {},
    recallList: (packName, keyword, limitBytes, now) => {
      recallListCalls.push({ packName, keyword, limitBytes, now })
      return FOUND_LIST
    },
    recallEpisode: (packName, id, limitBytes, now) => {
      recallEpisodeCalls.push({ packName, id, limitBytes, now })
      return FOUND_EPISODE
    },
    recallListCalls: () => recallListCalls,
    recallEpisodeCalls: () => recallEpisodeCalls,
  }
}

describe("createChatRecall / recallList", () => {
  it("ChatArchive の結果をそのまま返し、パック名・容量の表の recallListBytes・now を渡す", () => {
    const chatArchive = fakeChatArchive()
    const chatRecall = createChatRecall(chatArchive, "fictional-pack", () => 1_000, BUDGET)

    const result = chatRecall.recallList("散歩")

    expect(result).toEqual(FOUND_LIST)
    expect(chatArchive.recallListCalls()).toEqual([
      {
        packName: "fictional-pack",
        keyword: "散歩",
        limitBytes: BUDGET.recallListBytes,
        now: Temporal.Instant.fromEpochMilliseconds(1_000),
      },
    ])
  })

  it("1ターンに recallListsPerTurn 回まで引ける。超えたら ChatArchive を読まずに exhausted を返す", () => {
    const chatArchive = fakeChatArchive()
    const chatRecall = createChatRecall(chatArchive, "fictional-pack", () => 1_000, BUDGET)

    expect(chatRecall.recallList("散歩").kind).toBe("found")
    expect(chatRecall.recallList("料理").kind).toBe("found")
    expect(chatRecall.recallList("三度目").kind).toBe("exhausted")

    expect(chatArchive.recallListCalls()).toHaveLength(2)
  })

  it("finishTurn を呼ぶと、また recallListsPerTurn 回から数え直す", () => {
    const chatArchive = fakeChatArchive()
    const chatRecall = createChatRecall(chatArchive, "fictional-pack", () => 1_000, BUDGET)
    chatRecall.recallList("1回目")
    chatRecall.recallList("2回目")
    expect(chatRecall.recallList("3回目").kind).toBe("exhausted")

    chatRecall.finishTurn()

    expect(chatRecall.recallList("次のターン").kind).toBe("found")
  })
})

describe("createChatRecall / recallEpisode", () => {
  it("ChatArchive の結果をそのまま返し、パック名・容量の表の recallEpisodeBytes・now を渡す", () => {
    const chatArchive = fakeChatArchive()
    const chatRecall = createChatRecall(chatArchive, "fictional-pack", () => 2_000, BUDGET)

    const result = chatRecall.recallEpisode("2026-09-25-1")

    expect(result).toEqual(FOUND_EPISODE)
    expect(chatArchive.recallEpisodeCalls()).toEqual([
      {
        packName: "fictional-pack",
        id: "2026-09-25-1",
        limitBytes: BUDGET.recallEpisodeBytes,
        now: Temporal.Instant.fromEpochMilliseconds(2_000),
      },
    ])
  })

  it("1ターンに recallEpisodesPerTurn 件まで開ける。超えたら ChatArchive を読まずに exhausted を返す", () => {
    const chatArchive = fakeChatArchive()
    const chatRecall = createChatRecall(chatArchive, "fictional-pack", () => 2_000, BUDGET)

    expect(chatRecall.recallEpisode("id-1").kind).toBe("found")
    expect(chatRecall.recallEpisode("id-2").kind).toBe("found")
    expect(chatRecall.recallEpisode("id-3").kind).toBe("exhausted")

    expect(chatArchive.recallEpisodeCalls()).toHaveLength(2)
  })

  it("recallList と recallEpisode の回数は別々に数える", () => {
    const chatArchive = fakeChatArchive()
    const chatRecall = createChatRecall(chatArchive, "fictional-pack", () => 2_000, BUDGET)

    chatRecall.recallList("1回目")
    chatRecall.recallList("2回目")
    expect(chatRecall.recallList("3回目").kind).toBe("exhausted")

    // 一覧を引ける回数を使い切っていても、エピソードはまだ開ける。
    expect(chatRecall.recallEpisode("id-1").kind).toBe("found")
  })

  it("finishTurn を呼ぶと、また recallEpisodesPerTurn 件から数え直す", () => {
    const chatArchive = fakeChatArchive()
    const chatRecall = createChatRecall(chatArchive, "fictional-pack", () => 2_000, BUDGET)
    chatRecall.recallEpisode("id-1")
    chatRecall.recallEpisode("id-2")
    expect(chatRecall.recallEpisode("id-3").kind).toBe("exhausted")

    chatRecall.finishTurn()

    expect(chatRecall.recallEpisode("次のターン").kind).toBe("found")
  })
})
