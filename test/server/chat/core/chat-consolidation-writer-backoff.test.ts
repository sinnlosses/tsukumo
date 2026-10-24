import { describe, expect, it } from "vitest"

import type { ChatUnconsolidatedBatch } from "../../../../src/server/chat/core/chat-archive-port.ts"
import {
  CHAT_CONSOLIDATION_BACKOFF,
  createChatConsolidationWriter,
} from "../../../../src/server/chat/core/chat-consolidation-writer.ts"
import type { ChatSummary } from "../../../../src/server/chat/core/chat-memory.ts"
import { StructuredQueryResultError } from "../../../../src/server/core/structured-query.ts"
import type { CharacterPackName } from "../../../../src/shared/character-pack/character.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { characterPackName } from "../../../fixture/character.ts"

const PACK = characterPackName("fictional")
const ANOTHER_PACK = characterPackName("another-fictional")

const DUE_BATCH: ChatUnconsolidatedBatch = {
  entries: [
    {
      at: "2026-09-20T10:00:00+09:00",
      kind: "request",
      origin: { mode: "chat" },
      text: "架空の発言",
    },
  ],
  usedBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes,
  overflowed: false,
}

const VALID_OUTPUT = {
  synopsis: "架空のあらすじ",
  topics: [],
}

/** 次の回の振る舞い（`not-due` は未定着の行が契機に届かない回）。 */
type Reply = "valid" | "reject" | "result-error" | "unreadable" | "shrunk" | "hang" | "not-due"

/** `query()` の振る舞いを回ごとに替えられ、錠を取った回数と `query()` を起こした回数を数える口。 */
function createHarness() {
  let reply: Reply = "valid"
  let summary = ""
  let locks = 0
  let queries = 0
  const chatSummary: ChatSummary = {
    read: () => ({ summary, delivered: true }),
    readTopics: () => [],
    readFold: () => ({ kind: "unknown" }),
    write: (next) => {
      summary = next
      return { kind: "written", droppedLines: 0 }
    },
    markUndelivered: () => {},
    markDelivered: () => {},
  }
  let appended = 0
  const write = createChatConsolidationWriter({
    archive: {
      unconsolidated: () => (reply === "not-due" ? { ...DUE_BATCH, usedBytes: 0 } : DUE_BATCH),
      // 呼ぶたびに契機の分だけ追記が進むことにして、契機の手前の読み飛ばしを起こさない。
      appendedBytes: () => (appended += CHAT_MEMORY_BUDGET.consolidateEveryBytes),
    },
    lockConsolidation: () => {
      locks += 1
      return { release: () => {} }
    },
    chatSummary: () => chatSummary,
    query: (_request, signal) => {
      queries += 1
      switch (reply) {
        case "valid":
        case "not-due":
          return Promise.resolve(VALID_OUTPUT)
        case "reject":
          return Promise.reject(new Error("架空の失敗"))
        case "result-error":
          return Promise.reject(new StructuredQueryResultError("error_max_turns"))
        case "unreadable":
          return Promise.resolve({ ...VALID_OUTPUT, synopsis: "" })
        case "shrunk":
          return Promise.resolve({ ...VALID_OUTPUT, synopsis: "あ" })
        case "hang":
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("架空の中断"))
            })
          })
      }
    },
    now: () => 0,
  })
  return {
    run: async (next: Reply, packName: CharacterPackName = PACK) => {
      reply = next
      if (next === "shrunk") {
        // 前のあらすじを長くしておき、半分未満に縮んだ結果を返させる。
        summary = "あ".repeat(200)
      }
      if (next === "hang") {
        const abort = new AbortController()
        const running = write(packName, abort.signal)
        abort.abort()
        return running
      }
      return write(packName, new AbortController().signal)
    },
    locks: () => locks,
    queries: () => queries,
  }
}

const THRESHOLD = CHAT_CONSOLIDATION_BACKOFF.failuresBeforeBackoff

async function failTimes(
  harness: ReturnType<typeof createHarness>,
  times: number,
  reply: Reply = "reject",
) {
  for (let count = 0; count < times; count += 1) {
    expect((await harness.run(reply)).kind).toBe("failed")
  }
}

describe("続けて落ちたパックの定着の間引き", () => {
  it.each(["reject", "result-error", "unreadable"] as const)(
    "%s で閾値の手前まで落ちても、次の契機は query() を起こす",
    async (reply) => {
      const harness = createHarness()
      await failTimes(harness, THRESHOLD - 1, reply)

      expect((await harness.run("valid")).kind).toBe("written")
      expect(harness.queries()).toBe(THRESHOLD)
    },
  )

  it("閾値に達したら、次の2回の契機は錠も取らず query() も起こさず backed-off を返し、過ぎたら起こす。また落ちれば次は4回飛ばす", async () => {
    const harness = createHarness()
    await failTimes(harness, THRESHOLD)

    expect(await harness.run("valid")).toEqual({ kind: "backed-off" })
    expect(await harness.run("valid")).toEqual({ kind: "backed-off" })
    expect(harness.queries()).toBe(THRESHOLD)
    expect(harness.locks()).toBe(THRESHOLD)

    await failTimes(harness, 1)
    expect(harness.queries()).toBe(THRESHOLD + 1)
    for (let count = 0; count < 4; count += 1) {
      expect(await harness.run("valid")).toEqual({ kind: "backed-off" })
    }
    expect((await harness.run("valid")).kind).toBe("written")
    expect(harness.queries()).toBe(THRESHOLD + 2)
  })

  it("飛ばす回数は maxSkips で頭打ちになる", async () => {
    const harness = createHarness()
    await failTimes(harness, THRESHOLD - 1)
    let skipped = 0
    for (let round = 0; round < 8; round += 1) {
      skipped = 0
      while ((await harness.run("reject")).kind === "backed-off") {
        skipped += 1
      }
    }

    expect(skipped).toBe(CHAT_CONSOLIDATION_BACKOFF.maxSkips)
  })

  it("中断（aborted）と縮み（synopsis-shrunk）は数えない", async () => {
    const harness = createHarness()
    await failTimes(harness, THRESHOLD - 1)

    expect(await harness.run("hang")).toEqual({ kind: "failed", reason: "aborted" })
    expect(await harness.run("shrunk")).toEqual({
      kind: "failed",
      reason: "unreadable-result",
      rejection: "synopsis-shrunk",
    })
    expect(harness.queries()).toBe(THRESHOLD + 1)

    await failTimes(harness, 1)
    expect(await harness.run("valid")).toEqual({ kind: "backed-off" })
  })

  it.each([
    ["書けた", "valid", "written"],
    ["契機に届かなかった", "not-due", "not-due"],
  ] as const)(
    "%s回で勘定は 0 に戻り、そのあと閾値の手前まで落ちても飛ばさない",
    async (_label, reply, kind) => {
      const harness = createHarness()
      await failTimes(harness, THRESHOLD - 1)
      expect((await harness.run(reply)).kind).toBe(kind)

      await failTimes(harness, THRESHOLD - 1)
      expect((await harness.run("valid")).kind).toBe("written")
    },
  )

  it("勘定はパックごとに別で、閾値に達したパックがあっても別のパックは起こす", async () => {
    const harness = createHarness()
    await failTimes(harness, THRESHOLD)

    expect((await harness.run("valid", ANOTHER_PACK)).kind).toBe("written")
    expect(await harness.run("valid")).toEqual({ kind: "backed-off" })
  })
})
