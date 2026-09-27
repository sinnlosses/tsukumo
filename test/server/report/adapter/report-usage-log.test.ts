import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createReportUsageLog } from "../../../../src/server/report/adapter/report-usage-log.ts"
import type { ReportUsageEntry } from "../../../../src/server/report/core/report-usage.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../../../../src/shared/report/report-usage-record.ts"

// 数も名前もすべて手で書いた架空のもの（実物のレポートの中身は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-report-usage-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 書き込み先（本物の `~/.tsukumo/report-usage` の代わり）。 */
function root(): string {
  return join(dir, "report-usage")
}

/** ある日のローカル時刻のエポックミリ秒（日をまたぐ心配をしない値）。 */
function at(hour: number, minute: number, day = 22): number {
  return Temporal.ZonedDateTime.from({
    year: 2026,
    month: 9,
    day,
    hour,
    minute,
    second: 0,
    timeZone: Temporal.Now.timeZoneId(),
  }).epochMilliseconds
}

function entry(when: number, sessionId = "claude-session-1"): ReportUsageEntry {
  return {
    at: when,
    sessionId,
    blockKinds: ["text", "table"],
    notations: ["list"],
    unknownBlockCount: 0,
  }
}

function readLines(fileName: string): unknown[] {
  return readFileSync(join(root(), fileName), "utf8")
    .trimEnd()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line))
}

/** 行の鍵の並び（順序を見たいので `toMatchObject` とは別に取る）。 */
function keysOf(value: unknown): readonly string[] {
  return typeof value === "object" && value !== null ? Object.keys(value) : []
}

describe("createReportUsageLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", () => {
    const log = createReportUsageLog(root())

    log.append(entry(at(9, 0), "claude-session-1"))
    log.append(entry(at(23, 30), "claude-session-2"))
    log.append(entry(at(1, 15, 23), "claude-session-3"))

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("1行の鍵は版・日時・セッションID・塊の種類・逃げ道の記法・知らない種類の数で、日時は ISO 8601（オフセット付き）", () => {
    const log = createReportUsageLog(root())

    log.append(entry(at(9, 0)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual([
      "v",
      "at",
      "sessionId",
      "blockKinds",
      "notations",
      "unknownBlockCount",
    ])
    expect(record).toMatchObject({
      v: REPORT_USAGE_FORMAT_VERSION,
      sessionId: "claude-session-1",
      blockKinds: ["text", "table"],
      notations: ["list"],
      unknownBlockCount: 0,
    })
    // オフセットはそのマシンのローカル時刻で決まるので、頭だけを見る。
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T09:00:00[+-]\d{2}:\d{2}"/)
  })
})
