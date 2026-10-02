// 体験の数の記録。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/experience-metric/<YYYY-MM-DD>.jsonl` で、日付だけで分け、`cwd` には依存させない。
// 行の形と、書いてよいものの線は `ExperienceMetricRecord` が持つ。
//
// 書けなくても・読めなくても例外を投げない。壊れた行・版が違う行は読まずに1行ずつ落とす。

import { join } from "node:path"

import { z } from "zod"

import {
  EXPERIENCE_METRIC_FORMAT_VERSION,
  type ExperienceMetricRecord,
} from "../../../shared/experience-metric/experience-metric-record.ts"
import { appendJsonLine, dateFileNames, readJsonLines } from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type {
  ExperienceMetricEntry,
  ExperienceMetricLog,
  ExperienceMetricPeriod,
} from "../core/experience-metric.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/experience-metric/`）。 */
const EXPERIENCE_METRIC_DIR_NAME = "experience-metric"

/** 記録の1行の形（{@link ExperienceMetricRecord} と同じ鍵）。 */
const experienceMetricRecordSchema = z.discriminatedUnion("kind", [
  z.object({
    v: z.literal(EXPERIENCE_METRIC_FORMAT_VERSION),
    at: z.iso.datetime({ offset: true }),
    sessionId: z.string(),
    kind: z.literal("conclusion"),
    moment: z.enum(["deliver", "stumble"]),
    untilConclusionMs: z.number(),
    askingMs: z.number(),
    askCount: z.number(),
  }),
  z.object({
    v: z.literal(EXPERIENCE_METRIC_FORMAT_VERSION),
    at: z.iso.datetime({ offset: true }),
    sessionId: z.string(),
    kind: z.literal("recovery"),
    hands: z.number(),
    untilRecoveryMs: z.number(),
  }),
])

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
): ExperienceMetricLog {
  return {
    append: (entry) => {
      appendJsonLine(join(root, `${localDateKey(entry.at)}.jsonl`), toRecord(entry))
    },
    readRange: (period) => readEntriesInRange(root, period),
  }
}

/** 1件を、書き出す行（`ExperienceMetricRecord`）へ変換する。 */
function toRecord(entry: ExperienceMetricEntry): ExperienceMetricRecord {
  const v = EXPERIENCE_METRIC_FORMAT_VERSION
  const at = isoWithOffset(entry.at)
  return entry.kind === "conclusion"
    ? {
        v,
        at,
        sessionId: entry.sessionId,
        kind: "conclusion",
        moment: entry.moment,
        untilConclusionMs: entry.untilConclusionMs,
        askingMs: entry.askingMs,
        askCount: entry.askCount,
      }
    : {
        v,
        at,
        sessionId: entry.sessionId,
        kind: "recovery",
        hands: entry.hands,
        untilRecoveryMs: entry.untilRecoveryMs,
      }
}

/** 期間に入る日付のファイルだけを開き、古い→新しい順に件を集める。 */
function readEntriesInRange(
  root: string,
  period: ExperienceMetricPeriod,
): readonly ExperienceMetricEntry[] {
  return dateFileNames(root)
    .filter((name) => {
      const date = name.slice(0, 10)
      return date >= period.startDate && date <= period.endDate
    })
    .flatMap((fileName) => readValidEntries(join(root, fileName)))
}

/** 1ファイルの行を検証して件に戻す（通らない行は1行ずつ落とす）。 */
function readValidEntries(path: string): readonly ExperienceMetricEntry[] {
  return readJsonLines(path).flatMap((raw) => {
    const parsed = experienceMetricRecordSchema.safeParse(raw)
    return parsed.success ? [fromRecord(parsed.data)] : []
  })
}

/** 読み戻した1行を件に戻す（{@link toRecord} の逆）。 */
function fromRecord(record: ExperienceMetricRecord): ExperienceMetricEntry {
  const at = Temporal.Instant.from(record.at).epochMilliseconds
  return record.kind === "conclusion"
    ? {
        at,
        sessionId: record.sessionId,
        kind: "conclusion",
        moment: record.moment,
        untilConclusionMs: record.untilConclusionMs,
        askingMs: record.askingMs,
        askCount: record.askCount,
      }
    : {
        at,
        sessionId: record.sessionId,
        kind: "recovery",
        hands: record.hands,
        untilRecoveryMs: record.untilRecoveryMs,
      }
}
