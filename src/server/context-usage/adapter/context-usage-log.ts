// コンテキストの内訳の記録（何が文脈を占めていたかを残す）。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/context-usage/<YYYY-MM-DD>.jsonl` で、日付だけで分け、`cwd` には依存させない。
//
// ターンごとの記録（`token-usage/`）とは別のディレクトリに積む。
// 1行 = 1セッションで数がまるで違うのと、「書いてよいもの」の線が種類ごとに違う（こちらはメモリファイルのパス・スキル名・MCP ツール名まで持つ）のが理由。
// 線の引き方は `ContextUsageRecord` が正典。
// 会話の文面・ツールの引数と結果は、渡される `ContextUsageEntry` にそもそも口が無いので通らない。
//
// 読み口を持たない。積んだ行を読むのは tsukumo の外（過去にさかのぼる分析）で、行に版（`v`）を書くのはその読む側のため。
//
// 書けなくても例外を投げない。

import {
  CONTEXT_USAGE_FORMAT_VERSION,
  type ContextUsageRecord,
  contextUsageRecordSchema,
} from "../../../shared/context-usage/context-usage-record.ts"
import { createDatedRecordLog, type DatedRecordLog } from "../../adapter/lib/dated-record-log.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import type { ContextUsageEntry, ContextUsageLog } from "../core/context-usage.ts"

const CONTEXT_USAGE_RETENTION_DAYS = 90

/** 書き込んでよいのはこの下だけ。 */
export function contextUsageDir(): string {
  return tsukumoHomePath("contextUsage")
}

/**
 * 記録の書き込み口を作る。`root` は置き場（既定は {@link contextUsageDir}）。
 * 1つの口を日をまたいで使い回せる（`append` のたびに `entry.at` から行き先を組み立てる）。
 */
export function createContextUsageLog(
  root: string = contextUsageDir(),
): ContextUsageLog & Pick<DatedRecordLog<ContextUsageRecord>, "flush" | "close" | "pruneExpired"> {
  const log = createDatedRecordLog(
    {
      schema: contextUsageRecordSchema,
      retentionDays: CONTEXT_USAGE_RETENTION_DAYS,
    },
    root,
  )
  return {
    append: (entry) => {
      log.append(localDateKey(entry.at), [toRecord(entry)])
    },
    flush: log.flush,
    close: log.close,
    pruneExpired: log.pruneExpired,
  }
}

/** 1セッションぶんの記録を、書き出す行（`ContextUsageRecord`）へ変換する。 */
function toRecord(entry: ContextUsageEntry): ContextUsageRecord {
  return {
    v: CONTEXT_USAGE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    mode: entry.mode,
    usage: entry.usage,
  }
}
