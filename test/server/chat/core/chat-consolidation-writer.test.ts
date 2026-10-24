import { describe, expect, it } from "vitest"

import type {
  ChatUnconsolidatedBatch,
  ChatUnconsolidatedLimits,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import {
  ChatConsolidationResultError,
  createChatConsolidationWriter,
} from "../../../../src/server/chat/core/chat-consolidation-writer.ts"
import {
  CHAT_CONSOLIDATION_LIMITS,
  type ChatConsolidationQuery,
} from "../../../../src/server/chat/core/chat-consolidation.ts"
import type {
  ChatFoldPoint,
  ChatSummary,
  ChatSummaryFold,
} from "../../../../src/server/chat/core/chat-memory.ts"
import type { CharacterPackName } from "../../../../src/shared/character-pack/character.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { characterPackName } from "../../../fixture/character.ts"

const PACK = characterPackName("fictional")

// `query()` は差し替え、本物の claude は起こさない。

/** 前の定着であらすじが取り込んだ最後の行の時刻。 */
const PREVIOUS_FOLDED_AT = "2026-09-20T09:59:00+09:00"

/** 契機にちょうど届いた量の、架空の未定着の行。 */
const DUE_BATCH: ChatUnconsolidatedBatch = {
  entries: [
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
      at: "2026-09-20T10:02:00+09:00",
      kind: "request",
      origin: { mode: "chat" },
      text: "架空の発言2",
    },
  ],
  usedBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes,
  overflowed: false,
}

const VALID_OUTPUT = {
  synopsis: "架空の書き直したあらすじ",
  topics: ["架空の話題1", "架空の話題2"],
}

/** 前の写しの本文（話題の見出しは別の欄にある）。 */
const PREVIOUS_SUMMARY = "架空の前のあらすじ"

/** 呼ばれた順（あらすじの書き込み）と中身を覚える、メモリ上の口。 */
function createPorts(
  batch: ChatUnconsolidatedBatch,
  query: (request: ChatConsolidationQuery, signal: AbortSignal) => Promise<unknown>,
  lockAvailable: boolean = true,
  summaryWritable: boolean = true,
  droppedLines: number = 0,
  initialFold: ChatSummaryFold = { kind: "through", at: PREVIOUS_FOLDED_AT },
) {
  const order: string[] = []
  const lockEvents: string[] = []
  const limits: ChatUnconsolidatedLimits[] = []
  const afters: ChatFoldPoint[] = []
  const queries: ChatConsolidationQuery[] = []
  const summaryPacks: string[] = []
  let summary = PREVIOUS_SUMMARY
  let topics: readonly string[] = ["架空の古い話題"]
  let fold: ChatSummaryFold = initialFold
  const chatSummary: ChatSummary = {
    read: () => ({ summary, delivered: true }),
    readTopics: () => topics,
    readFold: () => fold,
    write: (next, nextTopics, foldedThrough) => {
      order.push("write-summary")
      summary = next
      topics = nextTopics
      fold = { kind: "through", at: foldedThrough }
      return summaryWritable ? { kind: "written", droppedLines } : { kind: "failed" }
    },
    markUndelivered: () => {},
    markDelivered: () => {},
  }
  let appended = 0
  const write = createChatConsolidationWriter({
    archive: {
      appendedBytes: () => appended,
      unconsolidated: (_packName, given, after) => {
        limits.push(given)
        afters.push(after)
        return batch
      },
    },
    lockConsolidation: (packName, staleAfterMs, now) => {
      lockEvents.push(`lock ${packName} ${String(staleAfterMs)} ${now.toString()}`)
      if (!lockAvailable) {
        return undefined
      }
      return {
        release: () => {
          lockEvents.push("release")
        },
      }
    },
    chatSummary: (packName) => {
      summaryPacks.push(packName)
      return chatSummary
    },
    query: (request, signal) => {
      queries.push(request)
      return query(request, signal)
    },
    now: () => LOCKED_AT.epochMilliseconds,
  })
  return {
    write,
    order,
    lockEvents,
    limits,
    afters,
    queries,
    summaryPacks,
    appendBytes: (bytes: number) => {
      appended += bytes
    },
    summary: () => summary,
    setSummary: (next: string) => {
      summary = next
    },
    topics: () => topics,
    fold: () => fold,
  }
}

const NEVER_ABORTED = new AbortController().signal

const LOCKED_AT = Temporal.Instant.from("2026-09-26T00:00:00Z")

describe("createChatConsolidationWriter", () => {
  it("未定着の行が契機に届かなければ query() を起こさず not-due（窓の外を契機の2倍まで読む）", async () => {
    const ports = createPorts(
      { ...DUE_BATCH, usedBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes - 1 },
      () => Promise.resolve(VALID_OUTPUT),
    )

    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({ kind: "not-due" })
    expect(ports.queries).toEqual([])
    expect(ports.limits).toEqual([
      {
        recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes,
        maxBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes * 2,
      },
    ])
  })

  it("契機に届かなかったあと、追記が契機に届くまでは行を読まず not-due。届くと読む", async () => {
    const half = CHAT_MEMORY_BUDGET.consolidateEveryBytes / 2
    const ports = createPorts({ ...DUE_BATCH, usedBytes: half }, () =>
      Promise.resolve(VALID_OUTPUT),
    )

    // 起こしてから最初の1回は読む。
    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({ kind: "not-due" })
    expect(ports.limits.length).toBe(1)

    ports.appendBytes(half - 1)
    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({ kind: "not-due" })
    expect(ports.limits.length).toBe(1)

    ports.appendBytes(1)
    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({ kind: "not-due" })
    expect(ports.limits.length).toBe(2)
  })

  it("錠を取れなければ行も読まず query() も起こさず locked", async () => {
    const ports = createPorts(DUE_BATCH, () => Promise.resolve(VALID_OUTPUT), false)

    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({ kind: "locked" })
    expect(ports.limits).toEqual([])
    expect(ports.queries).toEqual([])
    expect(ports.lockEvents).toEqual([`lock fictional 240000 ${LOCKED_AT.toString()}`])
  })

  it.each([
    ["書けたとき", () => Promise.resolve(VALID_OUTPUT), "written"],
    ["契機に届かないとき", () => Promise.resolve(VALID_OUTPUT), "not-due"],
    ["query() が失敗したとき", () => Promise.reject(new Error("架空の失敗")), "failed"],
  ] as const)("%s も、終われば錠を外す", async (_name, query, kind) => {
    const batch = kind === "not-due" ? { ...DUE_BATCH, usedBytes: 0 } : DUE_BATCH
    const ports = createPorts(batch, query)

    expect((await ports.write(PACK, NEVER_ABORTED)).kind).toBe(kind)
    expect(ports.lockEvents).toEqual([`lock fictional 240000 ${LOCKED_AT.toString()}`, "release"])
  })

  it.each([
    [
      "先頭1件だけで上限（契機の2倍）を超えるとき",
      {
        entries: [
          {
            at: "2026-09-20T10:00:00+09:00",
            kind: "request" as const,
            origin: { mode: "chat" as const },
            text: "架空の発言",
          },
        ],
        usedBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes * 2 + 1,
        overflowed: true,
      },
    ],
    [
      "溢れる前の合計が契機に届かないとき（例: 先頭 5 KiB＋次 12 KiB）",
      {
        entries: [
          {
            at: "2026-09-20T10:00:00+09:00",
            kind: "request" as const,
            origin: { mode: "chat" as const },
            text: "架空の発言",
          },
        ],
        usedBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes - 1,
        overflowed: true,
      },
    ],
  ])("%s は overflowed が立っていれば query() を起こす", async (_name, batch) => {
    const singleEntryOutput = {
      synopsis: "架空の書き直したあらすじ",
      topics: ["架空の話題1"],
    }
    const ports = createPorts(batch, () => Promise.resolve(singleEntryOutput))

    const outcome = await ports.write(PACK, NEVER_ABORTED)

    expect(outcome).toEqual({
      kind: "written",
      topics: ["架空の話題1"],
      droppedLines: 0,
      shrinkWaived: false,
    })
    expect(ports.queries).toHaveLength(1)
  })

  it("写しが上限のために落とした行数を written に載せる", async () => {
    const ports = createPorts(DUE_BATCH, () => Promise.resolve(VALID_OUTPUT), true, true, 7)

    expect(await ports.write(PACK, NEVER_ABORTED)).toMatchObject({
      kind: "written",
      droppedLines: 7,
    })
  })

  it("届いていれば、あらすじの印より後の行と前のあらすじ（話題の見出しを除く）を渡し、あらすじを書いて、書いたファイルの話題を返す", async () => {
    const ports = createPorts(DUE_BATCH, () => Promise.resolve(VALID_OUTPUT))

    const outcome = await ports.write(PACK, NEVER_ABORTED)

    expect(outcome).toEqual({
      kind: "written",
      topics: ["架空の話題1", "架空の話題2"],
      droppedLines: 0,
      shrinkWaived: false,
    })
    const prompt = ports.queries[0]?.prompt ?? ""
    expect(prompt).toContain("架空の前のあらすじ")
    expect(prompt).not.toContain("架空の古い話題")
    expect(prompt).not.toContain("<topics>")

    expect(ports.afters).toEqual([{ kind: "through", at: PREVIOUS_FOLDED_AT }])
    expect(ports.order).toEqual(["write-summary"])
    // 本文には話題を埋め込まず、見出しは別の欄に書く。
    expect(ports.summary()).toBe("架空の書き直したあらすじ")
    expect(ports.topics()).toEqual(["架空の話題1", "架空の話題2"])
    expect(ports.fold()).toEqual({ kind: "through", at: "2026-09-20T10:02:00+09:00" })
    expect(ports.summaryPacks).toEqual([PACK])
  })

  it.each([
    ["まだ1行も畳んでいない", { kind: "none" }, { kind: "none" }],
    ["印を持たない写し（無い・旧い形）", { kind: "unknown" }, { kind: "none" }],
  ] as const)("あらすじが%sときはアーカイブの最初から読む", async (_name, fold, after) => {
    const ports = createPorts(DUE_BATCH, () => Promise.resolve(VALID_OUTPUT), true, true, 0, fold)

    expect((await ports.write(PACK, NEVER_ABORTED)).kind).toBe("written")
    expect(ports.afters).toEqual([after])
    expect(ports.fold()).toEqual({ kind: "through", at: "2026-09-20T10:02:00+09:00" })
  })

  it("出力の形が崩れているときは unreadable-result（shape-topics）で、あらすじに書かない", async () => {
    const ports = createPorts(DUE_BATCH, () =>
      Promise.resolve({ ...VALID_OUTPUT, topics: ["架空1", "架空2", "架空3", "架空4"] }),
    )

    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({
      kind: "failed",
      reason: "unreadable-result",
      rejection: "shape-topics",
    })
    expect(ports.order).toEqual([])
    expect(ports.summary()).toBe(PREVIOUS_SUMMARY)
  })

  it.each([
    ["空", "", "synopsis-empty"],
    ["予約タグ入り", "架空<tsukumo-aside>架空", "synopsis-reserved-tag"],
    ["長さ超過", "a".repeat(CHAT_MEMORY_BUDGET.synopsisBytes + 1), "synopsis-too-long"],
    ["前のあらすじから極端に縮んだ", "あ", "synopsis-shrunk"],
  ] as const)(
    "あらすじが%sときは unreadable-result で理由を返し、何も書かない",
    async (_name, synopsis, rejection) => {
      const ports = createPorts(DUE_BATCH, () => Promise.resolve({ ...VALID_OUTPUT, synopsis }))
      ports.setSummary("あ".repeat(CHAT_CONSOLIDATION_LIMITS.synopsisCompareMinChars))

      expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({
        kind: "failed",
        reason: "unreadable-result",
        rejection,
      })
      expect(ports.order).toEqual([])
    },
  )

  it("縮みの検査に続けて落ちると、synopsisShrinkWaiveAt 回目は縮んだまま書き、書けたら数え直す", async () => {
    let synopsis = "あ"
    const ports = createPorts(DUE_BATCH, () => Promise.resolve({ ...VALID_OUTPUT, synopsis }))
    const longPrevious = "あ".repeat(CHAT_CONSOLIDATION_LIMITS.synopsisCompareMinChars)
    const shrunkFailure = {
      kind: "failed",
      reason: "unreadable-result",
      rejection: "synopsis-shrunk",
    }
    const writeOnce = async () => {
      ports.setSummary(longPrevious)
      return ports.write(PACK, NEVER_ABORTED)
    }

    for (let count = 1; count < CHAT_CONSOLIDATION_LIMITS.synopsisShrinkWaiveAt; count += 1) {
      expect(await writeOnce()).toEqual(shrunkFailure)
    }
    expect(ports.order).toEqual([])
    expect(await writeOnce()).toMatchObject({ kind: "written", shrinkWaived: true })
    expect(ports.summary()).toBe("あ")

    synopsis = longPrevious
    expect(await writeOnce()).toMatchObject({ kind: "written", shrinkWaived: false })

    synopsis = "あ"
    expect(await writeOnce()).toEqual(shrunkFailure)
  })

  it("縮みで落ちた回数はパックごとに数える", async () => {
    const ports = createPorts(DUE_BATCH, () => Promise.resolve({ ...VALID_OUTPUT, synopsis: "あ" }))
    const writeOnce = async (packName: CharacterPackName) => {
      ports.setSummary("あ".repeat(CHAT_CONSOLIDATION_LIMITS.synopsisCompareMinChars))
      return ports.write(packName, NEVER_ABORTED)
    }

    for (let count = 1; count < CHAT_CONSOLIDATION_LIMITS.synopsisShrinkWaiveAt; count += 1) {
      expect((await writeOnce(PACK)).kind).toBe("failed")
    }
    expect(await writeOnce(characterPackName("another-fictional"))).toEqual({
      kind: "failed",
      reason: "unreadable-result",
      rejection: "synopsis-shrunk",
    })
  })

  it("query() が reject したときは threw で例外を運び、あらすじに書かない", async () => {
    const failure = new Error("架空の失敗")
    const ports = createPorts(DUE_BATCH, () => Promise.reject(failure))

    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({
      kind: "failed",
      reason: "threw",
      error: failure,
    })
    expect(ports.order).toEqual([])
    expect(ports.summary()).toBe(PREVIOUS_SUMMARY)
  })

  it.each([
    ["error_max_turns", "error_max_turns"],
    ["error_during_execution", "error_during_execution"],
    ["架空の知らない種類", "other"],
  ])("query() の result が %s で終わったときは query-result（%s）", async (subtype, resultKind) => {
    const ports = createPorts(DUE_BATCH, () =>
      Promise.reject(new ChatConsolidationResultError(subtype)),
    )

    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({
      kind: "failed",
      reason: "query-result",
      resultKind,
    })
    expect(ports.order).toEqual([])
  })

  it("あらすじの写しが書けなかったときは summary-write", async () => {
    const ports = createPorts(DUE_BATCH, () => Promise.resolve(VALID_OUTPUT), true, false)

    expect(await ports.write(PACK, NEVER_ABORTED)).toEqual({
      kind: "failed",
      reason: "summary-write",
    })
  })

  it("中断されたら待たずに aborted で返り、そのあと結果が届いても書かない", async () => {
    const { promise, resolve } = Promise.withResolvers<unknown>()
    const ports = createPorts(DUE_BATCH, () => promise)
    const abort = new AbortController()

    const outcome = ports.write(PACK, abort.signal)
    abort.abort()
    expect(await outcome).toEqual({ kind: "failed", reason: "aborted" })

    resolve(VALID_OUTPUT)
    await promise
    await Promise.resolve()
    expect(ports.order).toEqual([])
  })
})
