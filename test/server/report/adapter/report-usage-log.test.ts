import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createReportUsageLog } from "../../../../src/server/report/adapter/report-usage-log.ts"
import type { ReportUsageEntry } from "../../../../src/server/report/core/report-usage.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../../../../src/shared/report/report-usage-record.ts"
import { keysOf, readJsonLines } from "../../../fixture/jsonl.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("report-usage")

/** 書き込み先（本物の `~/.tsukumo/report-usage` の代わり）。 */
function root(): string {
  return join(dir(), "report-usage")
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
    blockFields: ["tableChange"],
    notations: ["list"],
    containedNotations: [],
    escapeNotations: [],
    unknownBlockCount: 0,
  }
}

function readLines(fileName: string): unknown[] {
  return readJsonLines(join(root(), fileName))
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

  it("1行の鍵は版・日時・セッションID・塊の種類と欄・逃げ道の記法（外・容れ物の中・塊の無いもの）・知らない種類の数で、日時は ISO 8601（オフセット付き）", () => {
    const log = createReportUsageLog(root())

    log.append(entry(at(9, 0)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual([
      "v",
      "at",
      "sessionId",
      "blockKinds",
      "blockFields",
      "notations",
      "containedNotations",
      "escapeNotations",
      "unknownBlockCount",
    ])
    expect(record).toMatchObject({
      v: REPORT_USAGE_FORMAT_VERSION,
      sessionId: "claude-session-1",
      blockKinds: ["text", "table"],
      blockFields: ["tableChange"],
      notations: ["list"],
      containedNotations: [],
      escapeNotations: [],
      unknownBlockCount: 0,
    })
    // オフセットはそのマシンのローカル時刻で決まるので、頭だけを見る。
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T09:00:00[+-]\d{2}:\d{2}"/)
  })

  it("差し戻しの行は同じ日付ファイルに入り、鍵は版・種類・日時・セッションID・差し戻しの名前だけ", () => {
    const log = createReportUsageLog(root())

    log.appendRejection({
      at: at(9, 5),
      sessionId: "claude-session-1",
      reasons: ["resend", "long-paragraph"],
    })

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "kind", "at", "sessionId", "reasons"])
    expect(record).toMatchObject({
      v: REPORT_USAGE_FORMAT_VERSION,
      kind: "rejected",
      sessionId: "claude-session-1",
      reasons: ["resend", "long-paragraph"],
    })
  })
})
