import { appendFileSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createExperienceMetricLog } from "../../../../src/server/usage/adapter/experience-metric-log.ts"
import {
  type ConclusionEntry,
  type RecoveryEntry,
  splitEntry,
} from "../../../../src/server/usage/core/experience-metric.ts"
import { EXPERIENCE_METRIC_FORMAT_VERSION } from "../../../../src/shared/usage/experience-metric-record.ts"
import { keysOf, readJsonLines } from "../../../fixture/jsonl.ts"
import { expectEveryFieldKept } from "../../../fixture/record-field.ts"
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
  it("日付ごとのファイルに1行ずつ追記する", async () => {
    const log = createExperienceMetricLog(root())

    log.append(conclusion(at(9, 0)))
    log.append(recovery(at(23, 30)))
    log.append(conclusion(at(1, 15, 23)))
    await log.flush()

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("渡された件の欄は、種類にかかわらず全部行に残る", async () => {
    const log = createExperienceMetricLog(root())
    const entries = [
      conclusion(at(9, 0)),
      recovery(at(9, 1)),
      splitEntry(
        { divider: "rowTop", releasedPercent: 40, previousPercent: 55 },
        "claude-session-1",
        at(9, 2),
      ),
    ]

    for (const written of entries) {
      log.append(written)
    }
    await log.flush()

    const lines = readLines("2026-09-22.jsonl")
    expect(lines).toHaveLength(entries.length)
    entries.forEach((written, index) => {
      expectEveryFieldKept(written, lines[index])
    })
  })

  it("90日を過ぎた日付のファイルだけを消す", async () => {
    const log = createExperienceMetricLog(root())
    log.append(conclusion(at(9, 0, 22)))
    log.append(conclusion(at(9, 0, 23)))
    await log.flush()

    log.pruneExpired("2026-12-22")

    expect(readdirSync(root())).toEqual(["2026-09-23.jsonl"])
  })

  it("閉じた依頼の行の鍵は、版・日時・セッションID・種類・局面・3つの数", async () => {
    const log = createExperienceMetricLog(root())

    log.append(conclusion(at(9, 0)))
    await log.flush()

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

  it("立ち直りの行の鍵は、版・日時・セッションID・種類・手数・時間", async () => {
    const log = createExperienceMetricLog(root())

    log.append(recovery(at(9, 0)))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "at", "sessionId", "kind", "hands", "untilRecoveryMs"])
  })

  it("行に出てくる文字列は、鍵の名前・時刻・セッションID・種類・局面の名前だけ", async () => {
    const log = createExperienceMetricLog(root())

    log.append(conclusion(at(9, 0)))
    log.append(recovery(at(9, 5)))
    await log.flush()

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
  it("期間に入る日の行だけを、書いた件の形に戻して古い順に返す", async () => {
    const log = createExperienceMetricLog(root())
    log.append(conclusion(at(23, 59, 21)))
    log.append(recovery(at(9, 0, 22)))
    log.append(conclusion(at(0, 0, 23)))
    await log.flush()

    expect(log.readRange({ startDate: "2026-09-22", endDate: "2026-09-23" })).toEqual([
      recovery(at(9, 0, 22)),
      conclusion(at(0, 0, 23)),
    ])
  })

  it("読む時間を秒数・字数・表率・図の有無だけの行に書き、読み戻す", async () => {
    const log = createExperienceMetricLog(root())
    const entry = {
      at: at(9, 0),
      sessionId: "claude-session-1",
      kind: "reading",
      readingSeconds: 42,
      bodyChars: 800,
      tableRate: 0.25,
      hasDiagram: true,
    } as const

    log.append(entry)
    await log.flush()

    expect(readLines("2026-09-22.jsonl")).toMatchObject([
      {
        v: EXPERIENCE_METRIC_FORMAT_VERSION,
        kind: "reading",
        readingSeconds: 42,
        bodyChars: 800,
        tableRate: 0.25,
        hasDiagram: true,
      },
    ])
    expect(log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })).toEqual([entry])
  })

  it("仕切りを離した1回を書き、読み戻す", async () => {
    const log = createExperienceMetricLog(root())
    const entry = splitEntry(
      { divider: "rowTop", releasedPercent: 62, previousPercent: 55 },
      "claude-session-1",
      at(9, 0),
    )

    log.append(entry)
    await log.flush()

    expect(readLines("2026-09-22.jsonl")).toMatchObject([
      {
        v: EXPERIENCE_METRIC_FORMAT_VERSION,
        kind: "split",
        divider: "rowTop",
        releasedPercent: 62,
        previousPercent: 55,
      },
    ])
    expect(log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })).toEqual([entry])
  })

  it("知らない仕切りの名前の行は読まずに落とす", async () => {
    const log = createExperienceMetricLog(root())
    log.append(conclusion(at(9, 0)))
    await log.flush()
    const unknownDivider = {
      v: 2,
      at: "2026-09-22T10:00:00+09:00",
      sessionId: "claude-session-1",
      kind: "split",
      divider: "任意の文字列",
      releasedPercent: 50,
      previousPercent: 40,
    }
    appendFileSync(join(root(), "2026-09-22.jsonl"), `${JSON.stringify(unknownDivider)}\n`)

    expect(log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })).toEqual([
      conclusion(at(9, 0)),
    ])
  })

  it("版1の行も読む", async () => {
    const log = createExperienceMetricLog(root())
    log.append(conclusion(at(9, 0)))
    await log.flush()
    const versionOne = {
      v: 1,
      at: "2026-09-22T10:00:00+09:00",
      sessionId: "claude-session-1",
      kind: "recovery",
      hands: 1,
      untilRecoveryMs: 1000,
    }
    appendFileSync(join(root(), "2026-09-22.jsonl"), `${JSON.stringify(versionOne)}\n`)

    expect(
      log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" }).map((e) => e.kind),
    ).toEqual(["conclusion", "recovery"])
  })

  it("置き場がまだ無いときは空の並びを返す", () => {
    const log = createExperienceMetricLog(root())

    expect(log.readRange({ startDate: "2026-09-01", endDate: "2026-09-30" })).toEqual([])
  })

  it("壊れた行・版が違う行は落とし、正しい行は残す", async () => {
    const log = createExperienceMetricLog(root())
    log.append(conclusion(at(9, 0)))
    await log.flush()
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
