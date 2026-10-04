// 診断ログ。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/diagnostic/<YYYY-MM-DD>.jsonl` で、日付だけで分け、`cwd` には依存させない。
// 行の形と、書いてよいものの線は `DiagnosticRecord` が持つ。
//
// 書けなくても・読めなくても・消せなくても例外を投げない。壊れた行・版が違う行は読まずに1行ずつ落とす。

import { rmSync } from "node:fs"
import { join } from "node:path"

import { groupBy, sortBy } from "remeda"
import { z } from "zod"

import {
  DIAGNOSTIC_FORMAT_VERSION,
  type DiagnosticEntry,
  type DiagnosticRecord,
} from "../../../shared/diagnostic/diagnostic-record.ts"
import { isSessionEventKind } from "../../../shared/session/session-event-kind.ts"
import { appendJsonLines, dateFileNames, readJsonLines } from "../../adapter/lib/jsonl.ts"
import { localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { DiagnosticLog, DiagnosticRange } from "../core/diagnostic.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/diagnostic/`）。 */
const DIAGNOSTIC_DIR_NAME = "diagnostic"

/** 日付ファイルを残す日数。これより古い日付のファイルは消す。 */
const DIAGNOSTIC_RETENTION_DAYS = 14

/** 記録の1行の形（{@link DiagnosticRecord} と同じ鍵）。 */
const diagnosticRecordSchema = z.discriminatedUnion("flow", [
  z.object({
    v: z.literal(DIAGNOSTIC_FORMAT_VERSION),
    flow: z.literal("session-event"),
    at: z.number(),
    generation: z.number(),
    kind: z.custom<DiagnosticRecord["kind"]>(isSessionEventKind),
  }),
])

/** 書き込んでよいのはこの下だけ。 */
export function diagnosticDir(): string {
  return join(tsukumoHomeDir(), DIAGNOSTIC_DIR_NAME)
}

/**
 * 記録の読み書き口を作る。`root` は置き場（既定は {@link diagnosticDir}）。
 * 1つの口を日をまたいで使い回せる（件ごとに `at` から行き先を組み立てる）。
 */
export function createDiagnosticLog(root: string = diagnosticDir()): DiagnosticLog {
  return {
    append: (entries) => {
      const byDate = groupBy(entries, (entry) => localDateKey(entry.at))
      for (const [date, dated] of Object.entries(byDate)) {
        appendJsonLines(join(root, `${date}.jsonl`), dated.map(toRecord))
      }
    },
    readRange: (range) => readEntriesInRange(root, range),
  }
}

/**
 * 今日（`today`。`YYYY-MM-DD`）から数えて {@link DIAGNOSTIC_RETENTION_DAYS} 日を過ぎた日付のファイルを消す。
 * 日付の名前でないファイルには触らない。
 */
export function pruneDiagnosticFiles(today: string, root: string = diagnosticDir()): void {
  const oldestKept = Temporal.PlainDate.from(today)
    .subtract({ days: DIAGNOSTIC_RETENTION_DAYS })
    .toString()
  for (const name of dateFileNames(root)) {
    if (name.slice(0, 10) < oldestKept) {
      removeQuietly(join(root, name))
    }
  }
}

function toRecord(entry: DiagnosticEntry): DiagnosticRecord {
  return { v: DIAGNOSTIC_FORMAT_VERSION, ...entry }
}

/** 範囲に掛かる日付のファイルだけを開き、範囲に入る件を時刻の順に集める。 */
function readEntriesInRange(root: string, range: DiagnosticRange): readonly DiagnosticEntry[] {
  const firstDate = localDateKey(range.startAt)
  const lastDate = localDateKey(range.endAt - 1)
  const entries = dateFileNames(root)
    .filter((name) => {
      const date = name.slice(0, 10)
      return date >= firstDate && date <= lastDate
    })
    .flatMap((fileName) => readValidEntries(join(root, fileName)))
    .filter((entry) => entry.at >= range.startAt && entry.at < range.endAt)
  return sortBy(entries, (entry) => entry.at)
}

/** 1ファイルの行を検証して件に戻す（通らない行は1行ずつ落とす）。 */
function readValidEntries(path: string): readonly DiagnosticEntry[] {
  return readJsonLines(path).flatMap((raw) => {
    const parsed = diagnosticRecordSchema.safeParse(raw)
    if (!parsed.success) {
      return []
    }
    const { v: _version, ...entry } = parsed.data
    return [entry]
  })
}

function removeQuietly(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // 消せなかった回は次の起動でまた試す。
  }
}
