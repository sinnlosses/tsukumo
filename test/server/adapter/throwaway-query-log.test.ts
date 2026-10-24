import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createThrowawayQueryLog } from "../../../src/server/adapter/throwaway-query-log.ts"
import {
  THROWAWAY_QUERY_FORMAT_VERSION,
  type ThrowawayQueryFootprint,
} from "../../../src/server/core/throwaway-query.ts"
import { keysOf, readJsonLines } from "../../fixture/jsonl.ts"
import { expectEveryFieldKept } from "../../fixture/record-field.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const dir = useTempDir("throwaway-query")

/** 書き込み先（本物の `~/.tsukumo/throwaway-query` の代わり）。 */
function root(): string {
  return join(dir(), "throwaway-query")
}

/** ある日のローカル時刻のエポックミリ秒。 */
function at(hour: number, day = 22): number {
  return Temporal.ZonedDateTime.from({
    year: 2026,
    month: 9,
    day,
    hour,
    minute: 0,
    second: 0,
    timeZone: Temporal.Now.timeZoneId(),
  }).epochMilliseconds
}

function answered(startedAt: number): ThrowawayQueryFootprint {
  return {
    kind: "welcome-greeting",
    startedAt,
    durationMs: 1200,
    outcome: "success",
    inputTokens: 1030,
    outputTokens: 79,
  }
}

function aborted(startedAt: number): ThrowawayQueryFootprint {
  return { kind: "chat-consolidation", startedAt, durationMs: 300, outcome: "aborted" }
}

function readLines(fileName: string): unknown[] {
  return readJsonLines(join(root(), fileName))
}

describe("createThrowawayQueryLog", () => {
  it("起こした日の日付ごとのファイルに1行ずつ追記する", async () => {
    const log = createThrowawayQueryLog(root())

    log.record(answered(at(9)))
    log.record(aborted(at(23)))
    log.record(answered(at(1, 23)))
    await log.flush()

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl")).toHaveLength(2)
    expect(readLines("2026-09-23.jsonl")).toHaveLength(1)
  })

  it("渡した足跡の欄は全部行に残る", async () => {
    const log = createThrowawayQueryLog(root())
    const footprints = [answered(at(9)), aborted(at(10))]

    for (const footprint of footprints) {
      log.record(footprint)
    }
    await log.flush()

    const lines = readLines("2026-09-22.jsonl")
    expect(lines).toHaveLength(footprints.length)
    footprints.forEach((footprint, index) => {
      expectEveryFieldKept(footprint, lines[index])
    })
  })

  it("result が届いた回の行の鍵は、版・種類・開始・所要・結果・入出力トークンだけ", async () => {
    const log = createThrowawayQueryLog(root())

    log.record(answered(at(9)))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual([
      "v",
      "kind",
      "startedAt",
      "durationMs",
      "outcome",
      "inputTokens",
      "outputTokens",
    ])
    expect(record).toMatchObject({ v: THROWAWAY_QUERY_FORMAT_VERSION, outcome: "success" })
    expect(JSON.stringify(record)).toMatch(/"startedAt":"2026-09-22T09:00:00[+-]\d{2}:\d{2}"/)
  })

  it("result が届かなかった回の行は、トークンの鍵を持たない", async () => {
    const log = createThrowawayQueryLog(root())

    log.record(aborted(at(9)))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "kind", "startedAt", "durationMs", "outcome"])
  })

  it("90日を過ぎた日付のファイルだけを消す", async () => {
    const log = createThrowawayQueryLog(root())
    log.record(answered(at(9, 22)))
    log.record(answered(at(9, 23)))
    await log.flush()

    log.pruneExpired("2026-12-22")

    expect(readdirSync(root())).toEqual(["2026-09-23.jsonl"])
  })
})
