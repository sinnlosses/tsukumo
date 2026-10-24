// 日付ごとの JSONL に記録を積み、日付の範囲で読み戻す口。
// 置き場は呼び出し元が渡し、日付ごとのファイル（`<YYYY-MM-DD>.jsonl`）を積む。何を書くかは決めず、行の形は呼び出し元が渡す schema が決める。
//
// 書けなくても・読めなくても・消せなくても例外を投げない。schema を通らない行は1行ずつ読み飛ばす。

import { rmSync, statSync } from "node:fs"
import { join } from "node:path"

import type { z } from "zod"

import {
  createJsonLinesAppender,
  dateFileNames,
  dateFileNamesBetween,
  type JsonLinesAppender,
  readValidLines,
} from "./jsonl.ts"

export type DatedRecordLogOptions<R> = {
  /** 行の形。書く形と読める形の両方を表す。 */
  readonly schema: z.ZodType<R>
  /** 日付ファイルを残す日数。`undefined` は消さない。 */
  readonly retentionDays: number | undefined
}

/** 読む日付の範囲（`YYYY-MM-DD`。`undefined` の側は絞らない）。 */
export type DatedRecordRange = {
  readonly startDate: string | undefined
  readonly endDate: string | undefined
}

export type DatedRecordLog<R> = Pick<JsonLinesAppender, "append" | "flush" | "close"> & {
  /** 置き場のパス。 */
  readonly dir: string
  /** 範囲に入る日付のファイルだけを開き、古い→新しい順に検証済みの行を返す。 */
  readonly readRange: (range: DatedRecordRange) => readonly R[]
  /** 今日（`YYYY-MM-DD`）から数えて保持の日数を過ぎた日付のファイルを消す。 */
  readonly pruneExpired: (today: string) => void
}

/** 読んだファイルの検証済みの行。`(mtime, size)` が変わらない間は開き直さない。 */
type ReadCache<R> = Map<
  string,
  { readonly mtimeMs: number; readonly size: number; readonly records: readonly R[] }
>

/** `dir` は置き場（`<YYYY-MM-DD>.jsonl` を積むディレクトリ）。 */
export function createDatedRecordLog<R>(
  options: DatedRecordLogOptions<R>,
  dir: string,
): DatedRecordLog<R> {
  const appender = createJsonLinesAppender(dir)
  const cache: ReadCache<R> = new Map()
  return {
    dir,
    append: appender.append,
    flush: appender.flush,
    close: appender.close,
    readRange: (range) =>
      dateFileNamesBetween(dir, range.startDate, range.endDate).flatMap((name) =>
        readCached(join(dir, name), options.schema, cache),
      ),
    pruneExpired: (today) => {
      if (options.retentionDays !== undefined) {
        pruneOlderThan(dir, today, options.retentionDays)
      }
    },
  }
}

/**
 * 1ファイルの行を検証して返す。
 * 読む前の `(mtime, size)` を控えるので、読んでいる間に追記されても次の読みで気づく。
 */
function readCached<R>(path: string, schema: z.ZodType<R>, cache: ReadCache<R>): readonly R[] {
  const stat = statOf(path)
  if (stat === undefined) {
    return []
  }
  const cached = cache.get(path)
  if (cached?.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.records
  }
  const records = readValidLines(path, schema)
  cache.set(path, { ...stat, records })
  return records
}

function statOf(path: string): { mtimeMs: number; size: number } | undefined {
  try {
    const { mtimeMs, size } = statSync(path)
    return { mtimeMs, size }
  } catch {
    return undefined
  }
}

function pruneOlderThan(dir: string, today: string, days: number): void {
  const oldestKept = Temporal.PlainDate.from(today).subtract({ days }).toString()
  for (const name of dateFileNames(dir)) {
    if (name.slice(0, 10) < oldestKept) {
      try {
        rmSync(join(dir, name), { force: true })
      } catch {
        // 消せなかった回は次の起動でまた試す。
      }
    }
  }
}
