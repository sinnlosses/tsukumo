import { describe, expect, it } from "bun:test"

import { chatTopics } from "../../../../src/server/chat/core/chat-compact.ts"
import { createChatConsolidationWriter } from "../../../../src/server/chat/core/chat-consolidation-writer.ts"
import { type ChatConsolidationQuery } from "../../../../src/server/chat/core/chat-consolidation.ts"
import {
  type ChatEpisodeDraft,
  type ChatSummary,
  type ChatUnconsolidatedBatch,
  type ChatUnconsolidatedLimits,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat-memory-budget.ts"

// 畳む行・あらすじ・エピソードはすべて手で書いた架空のもの（docs/coding-standards.md
// 「会話内容の扱い」）。`query()` は差し替え、本物の claude は起こさない。

/** 契機にちょうど届いた量の、架空の未定着の行。 */
const DUE_BATCH: ChatUnconsolidatedBatch = {
  entries: [
    { at: "2026-09-20T10:00:00+09:00", speaker: "user", text: "架空の発言1" },
    { at: "2026-09-20T10:01:00+09:00", speaker: "character", text: "架空の返事1" },
    { at: "2026-09-20T10:02:00+09:00", speaker: "user", text: "架空の発言2" },
  ],
  usedBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes,
  previousEpisodeTitle: "架空の直前の見出し",
}

const VALID_OUTPUT = {
  episodes: [
    { end: 2, title: "架空の見出し1", gist: "架空の要旨1", cues: ["架空の手がかり"], weight: 2 },
    { end: 3, title: "架空の見出し2", gist: "架空の要旨2", cues: ["架空の手がかり2"], weight: 1 },
  ],
  synopsis: "架空の書き直したあらすじ",
  topics: ["架空の話題1", "架空の話題2"],
}

/** 前の写し（`/compact` の写しの形。本文のあとに話題の組がある）。 */
const PREVIOUS_SUMMARY = "架空の前のあらすじ\n<topics>\n- 架空の古い話題\n</topics>"

/** 呼ばれた順（索引の追記とあらすじの書き込み）と中身を覚える、メモリ上の口。 */
function createPorts(
  batch: ChatUnconsolidatedBatch,
  query: (request: ChatConsolidationQuery, signal: AbortSignal) => Promise<unknown>,
) {
  const order: string[] = []
  const limits: ChatUnconsolidatedLimits[] = []
  const episodes: ChatEpisodeDraft[] = []
  const queries: ChatConsolidationQuery[] = []
  const summaryPacks: string[] = []
  let summary = PREVIOUS_SUMMARY
  const chatSummary: ChatSummary = {
    read: () => ({ summary, delivered: true }),
    write: (next) => {
      order.push("write-summary")
      summary = next
    },
    markUndelivered: () => {},
    markDelivered: () => {},
  }
  const write = createChatConsolidationWriter({
    archive: {
      unconsolidated: (_packName, given) => {
        limits.push(given)
        return batch
      },
      appendEpisodes: (_packName, drafts) => {
        order.push("append-episodes")
        episodes.push(...drafts)
      },
    },
    chatSummary: (packName) => {
      summaryPacks.push(packName)
      return chatSummary
    },
    query: (request, signal) => {
      queries.push(request)
      return query(request, signal)
    },
  })
  return { write, order, limits, episodes, queries, summaryPacks, summary: () => summary }
}

const NEVER_ABORTED = new AbortController().signal

describe("createChatConsolidationWriter", () => {
  it("未定着の行が契機に届かなければ query() を起こさず not-due（窓の外を契機の2倍まで読む）", async () => {
    const ports = createPorts(
      { ...DUE_BATCH, usedBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes - 1 },
      () => Promise.resolve(VALID_OUTPUT),
    )

    expect(await ports.write("fictional", NEVER_ABORTED)).toEqual({ kind: "not-due" })
    expect(ports.queries).toEqual([])
    expect(ports.limits).toEqual([
      {
        recentBytes: CHAT_MEMORY_BUDGET.recentBytes,
        maxBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes * 2,
      },
    ])
  })

  it("届いていれば、前のあらすじ（話題の組を除く）と直前の見出しを渡し、エピソード → あらすじの順に書いて、書いたファイルの話題を返す", async () => {
    const ports = createPorts(DUE_BATCH, () => Promise.resolve(VALID_OUTPUT))

    const outcome = await ports.write("fictional", NEVER_ABORTED)

    expect(outcome).toEqual({ kind: "written", topics: ["架空の話題1", "架空の話題2"] })
    const prompt = ports.queries[0]?.prompt ?? ""
    expect(prompt).toContain("架空の前のあらすじ")
    expect(prompt).toContain("架空の直前の見出し")
    expect(prompt).not.toContain("架空の古い話題")
    expect(prompt).not.toContain("<topics>")

    expect(ports.order).toEqual(["append-episodes", "write-summary"])
    expect(ports.episodes.map(({ from, to, title }) => ({ from, to, title }))).toEqual([
      {
        from: "2026-09-20T10:00:00+09:00",
        to: "2026-09-20T10:01:00+09:00",
        title: "架空の見出し1",
      },
      {
        from: "2026-09-20T10:02:00+09:00",
        to: "2026-09-20T10:02:00+09:00",
        title: "架空の見出し2",
      },
    ])
    // 本文の最後に tsukumo が組を置き、同じ取り出し方で読める。
    expect(ports.summary()).toStartWith("架空の書き直したあらすじ\n")
    expect(ports.summary()).toEndWith("</topics>")
    expect(chatTopics(ports.summary())).toEqual(["架空の話題1", "架空の話題2"])
    expect(ports.summaryPacks).toEqual(["fictional"])
  })

  it.each([
    ["出力の形が崩れている", () => Promise.resolve({ ...VALID_OUTPUT, episodes: [] })],
    ["query() が reject した", () => Promise.reject(new Error("架空の失敗"))],
  ])("%s ときは failed で、索引にもあらすじにも書かない", async (_name, query) => {
    const ports = createPorts(DUE_BATCH, query)

    expect(await ports.write("fictional", NEVER_ABORTED)).toEqual({ kind: "failed" })
    expect(ports.order).toEqual([])
    expect(ports.summary()).toBe(PREVIOUS_SUMMARY)
  })

  it("中断されたら待たずに failed で返り、そのあと結果が届いても書かない", async () => {
    const { promise, resolve } = Promise.withResolvers<unknown>()
    const ports = createPorts(DUE_BATCH, () => promise)
    const abort = new AbortController()

    const outcome = ports.write("fictional", abort.signal)
    abort.abort()
    expect(await outcome).toEqual({ kind: "failed" })

    resolve(VALID_OUTPUT)
    await promise
    await Promise.resolve()
    expect(ports.order).toEqual([])
  })
})
