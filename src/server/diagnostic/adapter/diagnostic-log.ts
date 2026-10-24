// 診断ログ。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/diagnostic/<YYYY-MM-DD>.jsonl` で、日付だけで分け、`cwd` には依存させない。
// 行の形と、書いてよいものの線は `DiagnosticRecord` が持つ。
//
// 書けなくても・読めなくても・消せなくても例外を投げない。壊れた行・版が違う行は読まずに1行ずつ落とす。

import { join } from "node:path"

import { groupBy, sortBy } from "remeda"

import {
  DIAGNOSTIC_FORMAT_VERSION,
  type DiagnosticEntry,
  type DiagnosticRecord,
  diagnosticRecordSchema,
} from "../../../shared/diagnostic/diagnostic-record.ts"
import { createDatedRecordLog, type DatedRecordLog } from "../../adapter/lib/dated-record-log.ts"
import { localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { DiagnosticLog, DiagnosticRange } from "../core/diagnostic.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/diagnostic/`）。 */
const DIAGNOSTIC_DIR_NAME = "diagnostic"

/** 日付ファイルを残す日数。これより古い日付のファイルは消す。 */
const DIAGNOSTIC_RETENTION_DAYS = 14

/** 書き込んでよいのはこの下だけ。 */
export function diagnosticDir(): string {
  return join(tsukumoHomeDir(), DIAGNOSTIC_DIR_NAME)
}

/**
 * 記録の読み書き口を作る。`root` は置き場（既定は {@link diagnosticDir}）。
 * 1つの口を日をまたいで使い回せる（件ごとに `at` から行き先を組み立てる）。
 */
export function createDiagnosticLog(
  root: string = diagnosticDir(),
): DiagnosticLog & Pick<DatedRecordLog<DiagnosticRecord>, "flush" | "close" | "pruneExpired"> {
  const log = createDatedRecordLog(
    {
      schema: diagnosticRecordSchema,
      retentionDays: DIAGNOSTIC_RETENTION_DAYS,
    },
    root,
  )
  return {
    append: (entries) => {
      const byDate = groupBy(entries, (entry) => localDateKey(entry.at))
      for (const [date, dated] of Object.entries(byDate)) {
        log.append(date, dated.map(toRecord))
      }
    },
    flush: log.flush,
    close: log.close,
    pruneExpired: log.pruneExpired,
    readRange: (range) => readEntriesInRange(log, range),
  }
}

function toRecord(entry: DiagnosticEntry): DiagnosticRecord {
  return { v: DIAGNOSTIC_FORMAT_VERSION, ...entry }
}

/** 範囲に掛かる日付のファイルだけを開き、範囲に入る件を時刻の順に集める。 */
function readEntriesInRange(
  log: DatedRecordLog<DiagnosticRecord>,
  range: DiagnosticRange,
): readonly DiagnosticEntry[] {
  const entries = log
    .readRange({ startDate: localDateKey(range.startAt), endDate: localDateKey(range.endAt - 1) })
    .map(({ v: _version, ...entry }) => entry)
    .filter((entry) => entry.at >= range.startAt && entry.at < range.endAt)
  return sortBy(entries, (entry) => entry.at)
}
