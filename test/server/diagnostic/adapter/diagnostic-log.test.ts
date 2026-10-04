import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createDiagnosticLog,
  pruneDiagnosticFiles,
} from "../../../../src/server/diagnostic/adapter/diagnostic-log.ts"
import {
  DIAGNOSTIC_FORMAT_VERSION,
  type DiagnosticEntry,
} from "../../../../src/shared/diagnostic/diagnostic-record.ts"
import { readJsonLines } from "../../../fixture/jsonl.ts"
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
  it("日付ごとのファイルに、版を付けて1件1行で追記する", () => {
    const log = createDiagnosticLog(root())

    log.append([footprint(at(9, 0)), footprint(at(23, 30)), footprint(at(1, 15, 23))])

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readJsonLines(join(root(), "2026-09-22.jsonl"))).toEqual([
      { v: DIAGNOSTIC_FORMAT_VERSION, ...footprint(at(9, 0)) },
      { v: DIAGNOSTIC_FORMAT_VERSION, ...footprint(at(23, 30)) },
    ])
  })

  it("範囲に入る件だけを、日をまたいで時刻の順に読み戻す", () => {
    const log = createDiagnosticLog(root())
    log.append([footprint(at(23, 30)), footprint(at(9, 0))])
    log.append([footprint(at(1, 15, 23), 2), footprint(at(8, 0, 23), 2)])

    expect(log.readRange({ startAt: at(9, 0), endAt: at(8, 0, 23) })).toEqual([
      footprint(at(9, 0)),
      footprint(at(23, 30)),
      footprint(at(1, 15, 23), 2),
    ])
  })

  it("`browser-error` の流れも1件1行で往復する", () => {
    const log = createDiagnosticLog(root())

    log.append([browserErrorFootprint(at(9, 0))])

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([
      browserErrorFootprint(at(9, 0)),
    ])
  })

  it("握りつぶしていた失敗（swallowed-failure）も、場所の名前と error.name・code で往復する", () => {
    const log = createDiagnosticLog(root())

    log.append([failureFootprint(at(10, 0))])

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([
      failureFootprint(at(10, 0)),
    ])
  })

  it("壊れた行・版が違う行・知らない種類の行は読み飛ばす", () => {
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

    expect(log.readRange({ startAt: at(0, 0), endAt: at(0, 0, 23) })).toEqual([footprint(at(9, 2))])
  })
})

describe("pruneDiagnosticFiles", () => {
  it("14日を過ぎた日付のファイルを消し、それより新しいものと日付でないファイルは残す", () => {
    mkdirSync(root(), { recursive: true })
    for (const name of ["2026-09-19.jsonl", "2026-09-20.jsonl", "2026-10-04.jsonl", "notes.txt"]) {
      writeFileSync(join(root(), name), "")
    }

    pruneDiagnosticFiles("2026-10-04", root())

    expect(readdirSync(root()).toSorted()).toEqual([
      "2026-09-20.jsonl",
      "2026-10-04.jsonl",
      "notes.txt",
    ])
  })

  it("置き場が無くても投げない", () => {
    expect(() => {
      pruneDiagnosticFiles("2026-10-04", root())
    }).not.toThrow()
  })
})
