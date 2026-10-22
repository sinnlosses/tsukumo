// 定着の途中で落ちたあと、次の定着がエピソードの範囲を抜かさず、同じ要約を二重に載せないこと。
// アーカイブと写しは本物のファイルに書き、`query()` だけを差し替える。

import { mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { readValidLines } from "../../../../src/server/adapter/lib/jsonl.ts"
import { createChatArchive } from "../../../../src/server/chat/adapter/chat-archive.ts"
import { createChatSummary } from "../../../../src/server/chat/adapter/chat-summary.ts"
import type {
  ChatArchive,
  ChatEpisodeDraft,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import {
  type ChatConsolidationOutcome,
  createChatConsolidationWriter,
} from "../../../../src/server/chat/core/chat-consolidation-writer.ts"
import type { ChatConsolidationQuery } from "../../../../src/server/chat/core/chat-consolidation.ts"
import type { ChatSummary } from "../../../../src/server/session-driver/core/session-driver.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PACK = characterPackName("fictional")

const dir = useTempDir("chat-consolidation-fold")

/** 1行がおよそ 1 KiB の架空の発言（窓の 16 KiB と1回の 16 KiB に収まる行数が読める大きさ）。 */
function fictionalLine(index: number): string {
  return `架空の発言${String(index).padStart(2, "0")}${"あ".repeat(340)}`
}

const LINE_COUNT = 50

const episodeTitleSchema = z.object({ to: z.string() })

/** 書き込みの一部を落とせる口を組み、定着を1回ずつ走らせる。 */
function createHarness() {
  const archiveRoot = join(dir(), "chat-archive")
  const summaryRoot = join(dir(), "chat-summary")
  const archive = createChatArchive(archiveRoot)
  const start = Temporal.Instant.from("2026-09-20T03:00:00Z").epochMilliseconds
  const appendLine = (index: number): void => {
    archive.append(PACK, {
      mode: "chat",
      kind: "request",
      at: start + index * 60_000,
      text: fictionalLine(index),
      images: undefined,
      imageFiles: undefined,
    })
  }
  for (let index = 0; index < LINE_COUNT; index += 1) {
    appendLine(index)
  }

  const faults: {
    summaryWrite: boolean
    foldWrite: boolean
    episodeAppend: "ok" | "fail" | "first-then-torn"
    queryRejects: boolean
  } = { summaryWrite: false, foldWrite: false, episodeAppend: "ok", queryRejects: false }
  const queries: ChatConsolidationQuery[] = []
  /** `unconsolidated` が返した行の番号（発言の先頭の2桁）を、呼ばれた順に。 */
  const batches: (readonly number[])[] = []
  let lastBatchLength = 0
  let synopsisCount = 0

  const faultyArchive: Pick<ChatArchive, "unconsolidated" | "appendEpisodes"> = {
    unconsolidated: (packName, limits, range) => {
      const batch = archive.unconsolidated(packName, limits, range)
      lastBatchLength = batch.entries.length
      batches.push(batch.entries.map((entry) => Number(entry.text.slice(5, 7))))
      return batch
    },
    appendEpisodes: (packName, drafts: readonly ChatEpisodeDraft[]) => {
      if (faults.episodeAppend === "fail") {
        return { kind: "failed" }
      }
      if (faults.episodeAppend === "first-then-torn") {
        archive.appendEpisodes(packName, drafts.slice(0, 1))
        writeFileSync(join(archiveRoot, PACK, "episode.jsonl"), '{"v":2,"id":"書きかけ', {
          flag: "a",
        })
        return { kind: "written" }
      }
      return archive.appendEpisodes(packName, drafts)
    },
  }
  const chatSummary = (): ChatSummary => {
    const real = createChatSummary(PACK, summaryRoot)
    return {
      ...real,
      write: (summary, topics, foldedThrough) =>
        faults.summaryWrite ? { kind: "failed" } : real.write(summary, topics, foldedThrough),
      writeFold: (fold) => (faults.foldWrite ? { kind: "failed" } : real.writeFold(fold)),
    }
  }
  const writer = createChatConsolidationWriter({
    archive: faultyArchive,
    lockConsolidation: () => ({ release: () => {} }),
    chatSummary,
    query: (request) => {
      queries.push(request)
      if (faults.queryRejects) {
        return Promise.reject(new Error("架空の失敗"))
      }
      const count = lastBatchLength
      const half = Math.max(1, Math.floor(count / 2))
      const ends = half < count ? [half, count] : [count]
      synopsisCount += 1
      return Promise.resolve({
        episodes: ends.map((end) => ({
          end,
          title: "架空の見出し",
          gist: "架空の要旨",
          cues: ["架空"],
          weight: 2,
        })),
        synopsis: `架空のあらすじ${String(synopsisCount).padStart(3, "0")}`,
        topics: [],
      })
    },
    now: () => 0,
  })

  return {
    faults,
    batches,
    queries,
    appendLine,
    summaryRoot,
    run: (): Promise<ChatConsolidationOutcome> => writer(PACK, new AbortController().signal),
    episodeEnds: (): readonly string[] =>
      readValidLines(join(archiveRoot, PACK, "episode.jsonl"), episodeTitleSchema).map(
        (line) => line.to,
      ),
    summary: () => createChatSummary(PACK, summaryRoot),
  }
}

/** 行の番号（0始まり）の `at`。 */
function lineAt(index: number): string {
  const start = Temporal.Instant.from("2026-09-20T03:00:00Z").epochMilliseconds
  return Temporal.Instant.fromEpochMilliseconds(start + index * 60_000)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toString({ timeZoneName: "never" })
}

describe("定着の途中で落ちたあとの次の定着", () => {
  it("落ちなければ、エピソードとあらすじの取り込んだところが揃い、次の回は続きから畳む", async () => {
    const harness = createHarness()

    expect((await harness.run()).kind).toBe("written")
    const firstEnds = harness.episodeEnds()
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: firstEnds.at(-1) })

    expect((await harness.run()).kind).toBe("written")
    const ends = harness.episodeEnds()
    expect(ends.length).toBeGreaterThan(firstEnds.length)
    expect(new Set(ends).size).toBe(ends.length)
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: ends.at(-1) })
  })

  it("エピソードを書いたあと、あらすじを書く前に落ちたら、次の回はその範囲であらすじだけを書き直し、索引には足さない", async () => {
    const harness = createHarness()
    harness.faults.summaryWrite = true
    expect(await harness.run()).toEqual({ kind: "failed", reason: "summary-write" })
    const endsAfterCrash = harness.episodeEnds()
    expect(harness.summary().readFold()).toEqual({ kind: "none" })

    harness.faults.summaryWrite = false
    expect((await harness.run()).kind).toBe("written")

    // 2回目の読みのうち、あらすじを書き直した範囲は落ちた回に畳んだ行と同じ。
    const [crashed, , resummarized] = harness.batches
    expect(resummarized).toEqual(crashed)
    expect(harness.episodeEnds()).toEqual(endsAfterCrash)
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: endsAfterCrash.at(-1) })
    expect(harness.summary().read()?.summary).toBe("架空のあらすじ002")

    expect((await harness.run()).kind).toBe("written")
    expect(harness.episodeEnds().length).toBeGreaterThan(endsAfterCrash.length)
    expect(harness.batches.at(-1)?.[0]).toBe((crashed?.at(-1) ?? 0) + 1)
  })

  it("エピソードを途中まで書いて書きかけで落ちたら、次の回は書けた範囲であらすじを直し、その次の回で残りを畳む", async () => {
    const harness = createHarness()
    harness.faults.episodeAppend = "first-then-torn"
    harness.faults.summaryWrite = true
    await harness.run()
    const [firstEnd] = harness.episodeEnds()

    harness.faults.episodeAppend = "ok"
    harness.faults.summaryWrite = false
    expect((await harness.run()).kind).toBe("written")
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: firstEnd })
    expect(harness.episodeEnds()).toEqual([firstEnd])

    expect((await harness.run()).kind).toBe("written")
    // 書けた1件と、続きの回が足した2件がすべて読める（書きかけの行に繋がって消えない）。
    const ends = harness.episodeEnds()
    expect(ends).toHaveLength(3)
    expect(new Set(ends).size).toBe(ends.length)
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: ends.at(-1) })
  })

  it("エピソードが書けなかったら、あらすじも取り込んだところも書かずに episode-write", async () => {
    const harness = createHarness()
    harness.summary().write("架空の前のあらすじ", [], lineAt(0))
    harness.faults.episodeAppend = "fail"

    expect(await harness.run()).toEqual({ kind: "failed", reason: "episode-write" })

    expect(harness.episodeEnds()).toEqual([])
    expect(harness.summary().read()?.summary).toBe("架空の前のあらすじ")
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: lineAt(0) })
  })

  it("取り込んだところの分からない写し（旧い形）は、追記の前にいまのエピソードの終わりを印にし、追記のあとで落ちても次の回で直る", async () => {
    const harness = createHarness()
    mkdirSync(harness.summaryRoot, { recursive: true })
    writeFileSync(join(harness.summaryRoot, "fictional.md"), "delivered\n架空の旧いあらすじ")
    harness.faults.summaryWrite = true

    expect(await harness.run()).toEqual({ kind: "failed", reason: "summary-write" })
    expect(readdirSync(harness.summaryRoot)).toEqual(["fictional.summary.json"])
    expect(harness.summary().read()).toEqual({ summary: "架空の旧いあらすじ", delivered: true })
    expect(harness.summary().readFold()).toEqual({ kind: "none" })

    harness.faults.summaryWrite = false
    const ends = harness.episodeEnds()
    expect((await harness.run()).kind).toBe("written")
    const [crashed, , resummarized] = harness.batches
    expect(resummarized).toEqual(crashed)
    expect(harness.episodeEnds()).toEqual(ends)
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: ends.at(-1) })
  })

  it("1回に畳む上限まで溜まった範囲で query() が落ちると、行が書き足されても次の回は同じ入力で query() を起こす", async () => {
    const harness = createHarness()
    harness.faults.queryRejects = true

    expect((await harness.run()).kind).toBe("failed")
    for (let index = LINE_COUNT; index < LINE_COUNT + 5; index += 1) {
      harness.appendLine(index)
    }
    expect((await harness.run()).kind).toBe("failed")

    const [first, second] = harness.batches
    expect(first?.at(-1)).toBeLessThan(LINE_COUNT - 1)
    expect(second).toEqual(first)
    expect(harness.queries).toHaveLength(2)
    expect(harness.queries[1]).toEqual(harness.queries[0])
    expect(harness.episodeEnds()).toEqual([])
    expect(harness.summary().readFold()).toEqual({ kind: "unknown" })
  })

  it("取り込んだところを置く書き込みが失敗したら、エピソードを書かずに summary-write", async () => {
    const harness = createHarness()
    harness.faults.foldWrite = true

    expect(await harness.run()).toEqual({ kind: "failed", reason: "summary-write" })

    expect(harness.episodeEnds()).toEqual([])
  })

  it("写しが無いときはいまのエピソードの終わりを印にし、それより前の行は畳み直さない", async () => {
    const harness = createHarness()
    createChatArchive(join(dir(), "chat-archive")).appendEpisodes(PACK, [
      {
        from: lineAt(0),
        to: lineAt(9),
        title: "架空の見出し",
        gist: "架空の要旨",
        cues: ["架空"],
        weight: 2,
      },
    ])

    expect((await harness.run()).kind).toBe("written")

    expect(harness.batches[0]?.[0]).toBe(10)
    expect(harness.batches).toHaveLength(1)
    expect(harness.summary().readFold()).toEqual({
      kind: "through",
      at: harness.episodeEnds().at(-1),
    })
  })
})
