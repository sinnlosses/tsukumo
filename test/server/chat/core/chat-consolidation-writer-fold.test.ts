// 定着があらすじの印の後ろから畳み進め、途中で落ちても範囲を抜かさず、同じ範囲を二重に畳まないこと。
// アーカイブと写しは本物のファイルに書き、`query()` だけを差し替える。

import { mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createChatArchive } from "../../../../src/server/chat/adapter/chat-archive.ts"
import { createChatSummary } from "../../../../src/server/chat/adapter/chat-summary.ts"
import type { ChatArchive } from "../../../../src/server/chat/core/chat-archive-port.ts"
import {
  type ChatConsolidationOutcome,
  createChatConsolidationWriter,
} from "../../../../src/server/chat/core/chat-consolidation-writer.ts"
import type { ChatSummary } from "../../../../src/server/chat/core/chat-memory.ts"
import type { StructuredQuery } from "../../../../src/server/core/structured-query.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PACK = characterPackName("fictional")

const dir = useTempDir("chat-consolidation-fold")

/** 1行がおよそ 1 KiB の架空の発言（窓の 16 KiB と1回の 16 KiB に収まる行数が読める大きさ）。 */
function fictionalLine(index: number): string {
  return `架空の発言${String(index).padStart(2, "0")}${"あ".repeat(340)}`
}

const LINE_COUNT = 50

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

  const faults: { summaryWrite: boolean; queryRejects: boolean } = {
    summaryWrite: false,
    queryRejects: false,
  }
  const queries: StructuredQuery[] = []
  /** `unconsolidated` が返した行の番号（発言の先頭の2桁）を、呼ばれた順に。 */
  const batches: (readonly number[])[] = []
  let synopsisCount = 0

  const recordingArchive: Pick<ChatArchive, "unconsolidated" | "appendedBytes"> = {
    appendedBytes: (packName) => archive.appendedBytes(packName),
    unconsolidated: (packName, limits, after) => {
      const batch = archive.unconsolidated(packName, limits, after)
      batches.push(batch.entries.map((entry) => Number(entry.text.slice(5, 7))))
      return batch
    },
  }
  const chatSummary = (): ChatSummary => {
    const real = createChatSummary(PACK, summaryRoot)
    return {
      ...real,
      write: (summary, topics, foldedThrough) =>
        faults.summaryWrite ? { kind: "failed" } : real.write(summary, topics, foldedThrough),
    }
  }
  const writer = createChatConsolidationWriter({
    archive: recordingArchive,
    lockConsolidation: () => ({ release: () => {} }),
    chatSummary,
    query: (request) => {
      queries.push(request)
      if (faults.queryRejects) {
        return Promise.reject(new Error("架空の失敗"))
      }
      synopsisCount += 1
      return Promise.resolve({
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

describe("あらすじの印から畳み進める定着", () => {
  it("書けたら印が畳んだ最後の行になり、次の回はその次の行から畳む", async () => {
    const harness = createHarness()

    expect((await harness.run()).kind).toBe("written")
    const [first = []] = harness.batches
    expect(first[0]).toBe(0)
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: lineAt(first.at(-1) ?? 0) })

    expect((await harness.run()).kind).toBe("written")
    const second = harness.batches[1] ?? []
    expect(second[0]).toBe((first.at(-1) ?? 0) + 1)
    expect(harness.summary().readFold()).toEqual({
      kind: "through",
      at: lineAt(second.at(-1) ?? 0),
    })
  })

  it("あらすじが書けなかったら印は進まず、次の回は同じ範囲を畳み直す", async () => {
    const harness = createHarness()
    harness.summary().write("架空の前のあらすじ", [], lineAt(0))
    harness.faults.summaryWrite = true

    expect(await harness.run()).toEqual({ kind: "failed", reason: "summary-write" })
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: lineAt(0) })
    expect(harness.summary().read()?.summary).toBe("架空の前のあらすじ")

    harness.faults.summaryWrite = false
    expect((await harness.run()).kind).toBe("written")
    const [crashed, retried] = harness.batches
    expect(crashed?.[0]).toBe(1)
    expect(retried).toEqual(crashed)
  })

  it("取り込んだところの分からない写しは、アーカイブの最初から畳み、印を持つ写しに書き直す", async () => {
    const harness = createHarness()
    mkdirSync(harness.summaryRoot, { recursive: true })
    writeFileSync(
      join(harness.summaryRoot, "fictional.summary.json"),
      JSON.stringify({
        v: 1,
        delivered: true,
        synopsis: "架空の旧いあらすじ",
        topics: [],
        fold: { kind: "unknown" },
      }),
    )

    expect((await harness.run()).kind).toBe("written")

    const [first = []] = harness.batches
    expect(first[0]).toBe(0)
    expect(harness.queries[0]?.prompt).toContain("架空の旧いあらすじ")
    expect(readdirSync(harness.summaryRoot)).toEqual(["fictional.summary.json"])
    expect(harness.summary().readFold()).toEqual({ kind: "through", at: lineAt(first.at(-1) ?? 0) })
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
    expect(harness.summary().readFold()).toEqual({ kind: "unknown" })
  })
})
