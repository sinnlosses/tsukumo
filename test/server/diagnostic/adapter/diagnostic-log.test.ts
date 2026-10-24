import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createDiagnosticLog } from "../../../../src/server/diagnostic/adapter/diagnostic-log.ts"
import {
  DIAGNOSTIC_FORMAT_VERSION,
  type DiagnosticEntry,
} from "../../../../src/shared/diagnostic/diagnostic-record.ts"
import { readJsonLines } from "../../../fixture/jsonl.ts"
import { expectEveryFieldKept } from "../../../fixture/record-field.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("diagnostic")

/** 書き込み先（本物の `~/.tsukumo/diagnostic` の代わり）。 */
function root(): string {
  return join(dir(), "diagnostic")
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

function footprint(when: number, generation = 1): DiagnosticEntry {
  return { flow: "session-event", at: when, generation, kind: "turn-finished" }
}

/** ブラウザの例外の足跡（手で組んだ架空の1件）。 */
function browserErrorFootprint(when: number): DiagnosticEntry {
  return {
    flow: "browser-error",
    at: when,
    route: "render-failure",
    errorName: "TypeError",
    frames: [{ origin: "bundle", line: 12, column: 3 }],
  }
}

/** 握りつぶしていた失敗の1件（`error.message` は無い）。 */
function failureFootprint(when: number): DiagnosticEntry {
  return {
    flow: "swallowed-failure",
    at: when,
    place: { feature: "session", place: "restart" },
    errorName: "TypeError",
    errorCode: "ENOENT",
  }
}

describe("createDiagnosticLog", () => {
  it("日付ごとのファイルに、版を付けて1件1行で追記する", async () => {
    const log = createDiagnosticLog(root())

    log.append([footprint(at(9, 0)), footprint(at(23, 30)), footprint(at(1, 15, 23))])
    await log.flush()

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readJsonLines(join(root(), "2026-09-22.jsonl"))).toEqual([
      { v: DIAGNOSTIC_FORMAT_VERSION, ...footprint(at(9, 0)) },
      { v: DIAGNOSTIC_FORMAT_VERSION, ...footprint(at(23, 30)) },
    ])
  })

  it("範囲に入る件だけを、日をまたいで時刻の順に読み戻す", async () => {
    const log = createDiagnosticLog(root())
    log.append([footprint(at(23, 30)), footprint(at(9, 0))])
    log.append([footprint(at(1, 15, 23), 2), footprint(at(8, 0, 23), 2)])
    await log.flush()

    expect(log.readRange({ startAt: at(9, 0), endAt: at(8, 0, 23) })).toEqual([
      footprint(at(9, 0)),
      footprint(at(23, 30)),
      footprint(at(1, 15, 23), 2),
    ])
  })

  it("`browser-error` の流れも1件1行で往復する", async () => {
    const log = createDiagnosticLog(root())

    log.append([browserErrorFootprint(at(9, 0))])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([
      browserErrorFootprint(at(9, 0)),
    ])
  })

  it("書いた行に、渡された件の欄が入れ子の中まで全部残る", async () => {
    const log = createDiagnosticLog(root())
    const written = browserErrorFootprint(at(9, 0))

    log.append([written])
    await log.flush()

    const lines = readJsonLines(join(root(), "2026-09-22.jsonl"))
    expect(lines).toHaveLength(1)
    expectEveryFieldKept(written, lines[0])
  })

  it("握りつぶしていた失敗（swallowed-failure）も、場所の名前と error.name・code で往復する", async () => {
    const log = createDiagnosticLog(root())

    log.append([failureFootprint(at(10, 0))])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([
      failureFootprint(at(10, 0)),
    ])
  })

  it("依頼の遅れ（prompt-delay）も区間のミリ秒で往復する", async () => {
    const log = createDiagnosticLog(root())
    const delay: DiagnosticEntry = {
      flow: "prompt-delay",
      at: at(10, 0),
      pushedAt: at(10, 0) - 4000,
      prepareMs: 3200,
      writeMs: 3500,
      replyMs: 500,
    }

    log.append([delay])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([delay])
  })

  it("準備の区間を持たない古い依頼の遅れも読める", async () => {
    const log = createDiagnosticLog(root())
    const delay: DiagnosticEntry = {
      flow: "prompt-delay",
      at: at(10, 0),
      pushedAt: at(10, 0) - 4000,
      writeMs: 3500,
      replyMs: 500,
    }

    log.append([delay])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([delay])
  })

  it("迎えの挨拶の書き込み（welcome-writing）も各回の結果と所要で往復する", async () => {
    const log = createDiagnosticLog(root())
    const writing: DiagnosticEntry = {
      flow: "welcome-writing",
      at: at(10, 0),
      target: "greeting",
      outcome: "written",
      durationMs: 9000,
      attempts: [
        { result: "rejected", reason: "too-long", ms: 6000 },
        { result: "written", ms: 3000 },
      ],
    }

    log.append([writing])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([writing])
  })

  it("あらすじの古い行を落としたこと（synopsis-trim）も往復する", async () => {
    const log = createDiagnosticLog(root())
    const trim: DiagnosticEntry = { flow: "synopsis-trim", at: at(10, 0), droppedLines: 4 }

    log.append([trim])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([trim])
  })

  it("report の関所が止めたこと（report-gate-block）も往復する", async () => {
    const log = createDiagnosticLog(root())
    const block: DiagnosticEntry = { flow: "report-gate-block", at: at(10, 0) }

    log.append([block])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([block])
  })

  it("壊れた行・版が違う行・知らない種類の行は読み飛ばす", async () => {
    const path = join(root(), "2026-09-22.jsonl")
    mkdirSync(root(), { recursive: true })
    appendFileSync(path, "{壊れた行\n")
    appendFileSync(path, `${JSON.stringify({ ...footprint(at(9, 0)), v: 999 })}\n`)
    appendFileSync(
      path,
      `${JSON.stringify({ ...footprint(at(9, 1)), v: DIAGNOSTIC_FORMAT_VERSION, kind: "unknown" })}\n`,
    )
    const log = createDiagnosticLog(root())
    log.append([footprint(at(9, 2))])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([footprint(at(9, 2))])
  })

  it("もう無い場所の名前を持つ swallowed-failure の行は、投げずにその行だけを読み飛ばす", async () => {
    const path = join(root(), "2026-09-22.jsonl")
    mkdirSync(root(), { recursive: true })
    appendFileSync(
      path,
      `${JSON.stringify({
        ...failureFootprint(at(9, 0)),
        place: { feature: "chat", place: "consolidation-shape-episode" },
        v: DIAGNOSTIC_FORMAT_VERSION,
      })}\n`,
    )
    const log = createDiagnosticLog(root())
    log.append([failureFootprint(at(9, 1))])
    await log.flush()

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([
      failureFootprint(at(9, 1)),
    ])
  })
})

describe("pruneExpired", () => {
  it("14日を過ぎた日付のファイルを消し、それより新しいものと日付でないファイルは残す", () => {
    mkdirSync(root(), { recursive: true })
    for (const name of ["2026-09-19.jsonl", "2026-09-20.jsonl", "2026-10-04.jsonl", "notes.txt"]) {
      writeFileSync(join(root(), name), "")
    }

    createDiagnosticLog(root()).pruneExpired("2026-10-04")

    expect(readdirSync(root()).toSorted()).toEqual([
      "2026-09-20.jsonl",
      "2026-10-04.jsonl",
      "notes.txt",
    ])
  })

  it("置き場が無くても投げない", () => {
    expect(() => {
      createDiagnosticLog(root()).pruneExpired("2026-10-04")
    }).not.toThrow()
  })
})
