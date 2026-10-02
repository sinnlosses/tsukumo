import { appendFileSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createExperienceMetricLog } from "../../../../src/server/experience-metric/adapter/experience-metric-log.ts"
import type {
  ConclusionEntry,
  RecoveryEntry,
} from "../../../../src/server/experience-metric/core/experience-metric.ts"
import { EXPERIENCE_METRIC_FORMAT_VERSION } from "../../../../src/shared/experience-metric/experience-metric-record.ts"
import { keysOf, readJsonLines } from "../../../fixture/jsonl.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("experience-metric")

/** 書き込み先（本物の `~/.tsukumo/experience-metric` の代わり）。 */
function root(): string {
  return join(dir(), "experience-metric")
}

/** ある日のローカル時刻のエポックミリ秒。 */
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

function conclusion(when: number): ConclusionEntry {
  return {
    at: when,
    sessionId: "claude-session-1",
    kind: "conclusion",
    moment: "deliver",
    untilConclusionMs: 95_000,
    askingMs: 12_000,
    askCount: 1,
  }
}

function recovery(when: number): RecoveryEntry {
  return {
    at: when,
    sessionId: "claude-session-1",
    kind: "recovery",
    hands: 2,
    untilRecoveryMs: 300_000,
  }
}

function readLines(fileName: string): unknown[] {
  return readJsonLines(join(root(), fileName))
}

describe("createExperienceMetricLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", () => {
    const log = createExperienceMetricLog(root())

    log.append(conclusion(at(9, 0)))
    log.append(recovery(at(23, 30)))
    log.append(conclusion(at(1, 15, 23)))

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("閉じた依頼の行の鍵は、版・日時・セッションID・種類・局面・3つの数", () => {
    const log = createExperienceMetricLog(root())

    log.append(conclusion(at(9, 0)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual([
      "v",
      "at",
      "sessionId",
      "kind",
      "moment",
      "untilConclusionMs",
      "askingMs",
      "askCount",
    ])
    expect(record).toMatchObject({ v: EXPERIENCE_METRIC_FORMAT_VERSION, moment: "deliver" })
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T09:00:00[+-]\d{2}:\d{2}"/)
  })

  it("立ち直りの行の鍵は、版・日時・セッションID・種類・手数・時間", () => {
    const log = createExperienceMetricLog(root())

    log.append(recovery(at(9, 0)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "at", "sessionId", "kind", "hands", "untilRecoveryMs"])
  })

  it("行に出てくる文字列は、鍵の名前・時刻・セッションID・種類・局面の名前だけ", () => {
    const log = createExperienceMetricLog(root())

    log.append(conclusion(at(9, 0)))
    log.append(recovery(at(9, 5)))

    const text = readFileSync(join(root(), "2026-09-22.jsonl"), "utf8")
    const strings = [...text.matchAll(/"([^"]*)"/g)].flatMap(([, value]) => value ?? [])
    const kinds = [...new Set(strings.filter((value) => !value.startsWith("2026-09-22T")))]
    expect(kinds.toSorted()).toEqual(
      [
        "v",
        "at",
        "sessionId",
        "kind",
        "moment",
        "untilConclusionMs",
        "askingMs",
        "askCount",
        "hands",
        "untilRecoveryMs",
        "claude-session-1",
        "conclusion",
        "recovery",
        "deliver",
      ].toSorted(),
    )
  })
})

describe("readRange", () => {
  it("期間に入る日の行だけを、書いた件の形に戻して古い順に返す", () => {
    const log = createExperienceMetricLog(root())
    log.append(conclusion(at(23, 59, 21)))
    log.append(recovery(at(9, 0, 22)))
    log.append(conclusion(at(0, 0, 23)))

    expect(log.readRange({ startDate: "2026-09-22", endDate: "2026-09-23" })).toEqual([
      recovery(at(9, 0, 22)),
      conclusion(at(0, 0, 23)),
    ])
  })

  it("置き場がまだ無いときは空の並びを返す", () => {
    const log = createExperienceMetricLog(root())

    expect(log.readRange({ startDate: "2026-09-01", endDate: "2026-09-30" })).toEqual([])
  })

  it("壊れた行・版が違う行は落とし、正しい行は残す", () => {
    const log = createExperienceMetricLog(root())
    log.append(conclusion(at(9, 0)))
    const otherVersion = {
      v: 999,
      at: "2026-09-22T10:00:00+09:00",
      sessionId: "claude-session-1",
      kind: "recovery",
      hands: 1,
      untilRecoveryMs: 1000,
    }
    appendFileSync(join(root(), "2026-09-22.jsonl"), `{壊れた行\n${JSON.stringify(otherVersion)}\n`)

    expect(log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })).toEqual([
      conclusion(at(9, 0)),
    ])
  })
})
