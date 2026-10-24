// 進行の計測値の記録。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/experience-metric/<YYYY-MM-DD>.jsonl` で、日付だけで分け、`cwd` には依存させない。
// 行の形と、書いてよいものの線は `ExperienceMetricRecord` が持つ。
//
// 書けなくても・読めなくても例外を投げない。壊れた行・版が違う行は読まずに1行ずつ落とす。

import { join } from "node:path"

import {
  EXPERIENCE_METRIC_FORMAT_VERSION,
  type ExperienceMetricRecord,
  experienceMetricRecordSchema,
} from "../../../shared/experience-metric/experience-metric-record.ts"
import { createDatedRecordLog, type DatedRecordLog } from "../../adapter/lib/dated-record-log.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { ExperienceMetricEntry, ExperienceMetricLog } from "../core/experience-metric.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/experience-metric/`）。 */
const EXPERIENCE_METRIC_DIR_NAME = "experience-metric"

const EXPERIENCE_METRIC_RETENTION_DAYS = 90

/** 書き込んでよいのはこの下だけ。 */
export function experienceMetricDir(): string {
  return join(tsukumoHomeDir(), EXPERIENCE_METRIC_DIR_NAME)
}

/**
 * 記録の読み書き口を作る。`root` は置き場（既定は {@link experienceMetricDir}）。
 * 1つの口を日をまたいで使い回せる（`append` のたびに `entry.at` から行き先を組み立てる）。
 */
export function createExperienceMetricLog(
  root: string = experienceMetricDir(),
): ExperienceMetricLog &
  Pick<DatedRecordLog<ExperienceMetricRecord>, "flush" | "close" | "pruneExpired"> {
  const log = createDatedRecordLog(
    {
      schema: experienceMetricRecordSchema,
      retentionDays: EXPERIENCE_METRIC_RETENTION_DAYS,
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
    readRange: (period) => log.readRange(period).map(fromRecord),
  }
}

/** 1件を、書き出す行（`ExperienceMetricRecord`）へ変換する。 */
function toRecord(entry: ExperienceMetricEntry): ExperienceMetricRecord {
  const v = EXPERIENCE_METRIC_FORMAT_VERSION
  const at = isoWithOffset(entry.at)
  switch (entry.kind) {
    case "conclusion":
      return {
        v,
        at,
        sessionId: entry.sessionId,
        kind: "conclusion",
        moment: entry.moment,
        untilConclusionMs: entry.untilConclusionMs,
        askingMs: entry.askingMs,
        askCount: entry.askCount,
      }
    case "recovery":
      return {
        v,
        at,
        sessionId: entry.sessionId,
        kind: "recovery",
        hands: entry.hands,
        untilRecoveryMs: entry.untilRecoveryMs,
      }
    case "split":
      return {
        v,
        at,
        sessionId: entry.sessionId,
        kind: "split",
        divider: entry.divider,
        releasedPercent: entry.releasedPercent,
        previousPercent: entry.previousPercent,
      }
  }
}

/** 読み戻した1行を件に戻す（{@link toRecord} の逆）。 */
function fromRecord(record: ExperienceMetricRecord): ExperienceMetricEntry {
  const at = Temporal.Instant.from(record.at).epochMilliseconds
  switch (record.kind) {
    case "conclusion":
      return {
        at,
        sessionId: record.sessionId,
        kind: "conclusion",
        moment: record.moment,
        untilConclusionMs: record.untilConclusionMs,
        askingMs: record.askingMs,
        askCount: record.askCount,
      }
    case "recovery":
      return {
        at,
        sessionId: record.sessionId,
        kind: "recovery",
        hands: record.hands,
        untilRecoveryMs: record.untilRecoveryMs,
      }
    case "split":
      return {
        at,
        sessionId: record.sessionId,
        kind: "split",
        divider: record.divider,
        releasedPercent: record.releasedPercent,
        previousPercent: record.previousPercent,
      }
  }
}
