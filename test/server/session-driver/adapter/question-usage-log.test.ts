import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createQuestionUsageLog } from "../../../../src/server/session-driver/adapter/question-usage-log.ts"
import type { QuestionUsageEntry } from "../../../../src/server/session-driver/core/question-usage.ts"
import { QUESTION_USAGE_FORMAT_VERSION } from "../../../../src/shared/session-driver/question-usage-record.ts"
import { keysOf, readJsonLines } from "../../../fixture/jsonl.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("question-usage")

/** 書き込み先（本物の `~/.tsukumo/question-usage` の代わり）。 */
function root(): string {
  return join(dir(), "question-usage")
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

function entry(when: number, sessionId = "claude-session-1"): QuestionUsageEntry {
  return { at: when, sessionId, optionCount: 3, previewCount: 1 }
}

function readLines(fileName: string): unknown[] {
  return readJsonLines(join(root(), fileName))
}

describe("createQuestionUsageLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", () => {
    const log = createQuestionUsageLog(root())

    log.append(entry(at(9, 0), "claude-session-1"))
    log.append(entry(at(23, 30), "claude-session-2"))
    log.append(entry(at(1, 15, 23), "claude-session-3"))

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("1行の鍵は版・日時・セッションID・選択肢の数・preview の付いた数で、日時は ISO 8601（オフセット付き）", () => {
    const log = createQuestionUsageLog(root())

    log.append(entry(at(9, 0)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "at", "sessionId", "optionCount", "previewCount"])
    expect(record).toMatchObject({
      v: QUESTION_USAGE_FORMAT_VERSION,
      sessionId: "claude-session-1",
      optionCount: 3,
      previewCount: 1,
    })
    // オフセットはそのマシンのローカル時刻で決まるので、頭だけを見る。
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T09:00:00[+-]\d{2}:\d{2}"/)
  })
})
