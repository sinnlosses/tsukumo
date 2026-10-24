// 使い捨ての問い合わせの記録。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/throwaway-query/<YYYY-MM-DD>.jsonl` で、起こした日の日付だけで分け、`cwd` には依存させない。
// 行の形と、書いてよいものの線は `ThrowawayQueryRecord` が持つ。
//
// 書けなくても例外を投げない。

import {
  type ThrowawayQueryFootprint,
  type ThrowawayQueryRecord,
  type ThrowawayQueryRecorder,
  THROWAWAY_QUERY_FORMAT_VERSION,
  throwawayQueryRecordSchema,
} from "../core/throwaway-query.ts"
import { createDatedRecordLog, type DatedRecordLog } from "./lib/dated-record-log.ts"
import { isoWithOffset, localDateKey } from "./local-time.ts"
import { tsukumoHomePath } from "./tsukumo-home.ts"

const THROWAWAY_QUERY_RETENTION_DAYS = 90

/**
 * 記録の書き口を作る。`root` は置き場（既定は `~/.tsukumo/throwaway-query`）。
 * 1つの口を日をまたいで使い回せる（`record` のたびに `startedAt` から行き先を組み立てる）。
 */
export function createThrowawayQueryLog(
  root: string = tsukumoHomePath("throwawayQuery"),
): { readonly record: ThrowawayQueryRecorder } & Pick<
  DatedRecordLog<ThrowawayQueryRecord>,
  "flush" | "close" | "pruneExpired"
> {
  const log = createDatedRecordLog(
    { schema: throwawayQueryRecordSchema, retentionDays: THROWAWAY_QUERY_RETENTION_DAYS },
    root,
  )
  return {
    record: (footprint) => {
      log.append(localDateKey(footprint.startedAt), [toRecord(footprint)])
    },
    flush: log.flush,
    close: log.close,
    pruneExpired: log.pruneExpired,
  }
}

/** 1回ぶんを、書き出す行へ変換する。 */
function toRecord(footprint: ThrowawayQueryFootprint): ThrowawayQueryRecord {
  const base = {
    v: THROWAWAY_QUERY_FORMAT_VERSION,
    kind: footprint.kind,
    startedAt: isoWithOffset(footprint.startedAt),
    durationMs: footprint.durationMs,
  } satisfies Pick<ThrowawayQueryRecord, "v" | "kind" | "startedAt" | "durationMs">

  switch (footprint.outcome) {
    case "aborted":
    case "threw":
    case "no-result":
      return { ...base, outcome: footprint.outcome }
    default:
      return {
        ...base,
        outcome: footprint.outcome,
        inputTokens: footprint.inputTokens,
        outputTokens: footprint.outputTokens,
      }
  }
}
