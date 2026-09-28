// トークン消費の記録（何にどれだけ使ったかを残す）。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/token-usage/<YYYY-MM-DD>.jsonl` で、日付だけで分ける。
// 使用量はキャラクターパックに依らないので、パックごとに分けると「その日いくら使ったか」を出すのに全部のディレクトリを混ぜ直すことになる。
// `cwd` にも依存させない（どのプロジェクトから起こしても同じ場所に積む）。
//
// 何をいつ書くかの判断はここが決めない。
// ここが持つのは「どこに・どんな形で書くか」と「日付の範囲からどのファイルを開くか」だけ。
//
// 1行に文字列で入るのは時刻・セッションID・モード・モデルの名前・ツールの名前だけ。
// 依頼の文面・セリフ・ツールの引数と結果は通らない（渡される `TokenUsageEntry` にそもそも口が無く、ツールの結果は長さ（数）に畳まれてから届く）。
// 読むときも検証して素通しするだけで、ログにも呼び出し元にも文面を足さない。
//
// 書けなくても・読めなくても例外を投げない。壊れた行・版が違う行は読まずに1行ずつ落とす。

import { join } from "node:path"

import { z } from "zod"

import {
  TOKEN_USAGE_FORMAT_VERSION,
  type TokenUsageRecord,
} from "../../../shared/token-usage/token-usage.ts"
import { appendJsonLine, dateFileNames, readJsonLines } from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { TokenUsageEntry, TokenUsageLog, TokenUsagePeriod } from "../core/token-usage.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/token-usage/`）。 */
const TOKEN_USAGE_DIR_NAME = "token-usage"

/** モデル1件ぶんの数（{@link ModelTokenUsage} と同じ鍵）。 */
const modelTokenUsageSchema = z.object({
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  thinkingTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  costUsd: z.number(),
})

/** assistant のステップの使用量（{@link StepTokenUsage} と同じ鍵）。 */
const stepTokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
})

/** ツール1種類ぶんの内訳（{@link ToolUsageCount} と同じ鍵）。 */
const toolUsageCountSchema = z.object({
  name: z.string(),
  calls: z.number(),
  resultBytes: z.number(),
})

/** 持ち場1つぶんの内訳（{@link ScopeUsage} と同じ鍵）。 */
const scopeUsageSchema = z.object({
  steps: z.number(),
  tokens: stepTokenUsageSchema,
  tools: z.array(toolUsageCountSchema),
})

/**
 * 記録の1行の形（{@link TokenUsageRecord} と同じ鍵）。
 * `v` が {@link TOKEN_USAGE_FORMAT_VERSION} と違う行はここで落ちる（古い版の行を「内訳を空として読む」ことはしない）。
 */
const tokenUsageRecordSchema = z.object({
  v: z.literal(TOKEN_USAGE_FORMAT_VERSION),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  sessionId: z.string(),
  mode: z.enum(["work", "chat"]),
  models: z.array(modelTokenUsageSchema),
  breakdown: z.object({ main: scopeUsageSchema, subagent: scopeUsageSchema }),
})

/** 書き込んでよいのはこの下だけ。 */
export function tokenUsageDir(): string {
  return join(tsukumoHomeDir(), TOKEN_USAGE_DIR_NAME)
}

/**
 * 記録の読み書き口を作る。`root` は置き場（既定は {@link tokenUsageDir}）。
 * 1つの口を日をまたいで使い回せる（`append` のたびに `entry.at` から行き先を組み立てる）。
 */
export function createTokenUsageLog(root: string = tokenUsageDir()): TokenUsageLog {
  return {
    append: (entry) => {
      appendJsonLine(join(root, `${localDateKey(entry.at)}.jsonl`), toRecord(entry))
    },
    readRange: (period) => readRecordsInRange(root, period),
  }
}

/** 1ターンぶんの記録を、書き出す行（`TokenUsageRecord`）へ変換する。 */
function toRecord(entry: TokenUsageEntry): TokenUsageRecord {
  return {
    v: TOKEN_USAGE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    mode: entry.mode,
    models: entry.models,
    breakdown: entry.breakdown,
  }
}

/**
 * 期間に入る日付のファイルだけを開き、古い→新しい順に行を集める（`TokenUsageLog.readRange` の実装）。
 * 期間の外のファイルは開かない（ファイル名が日付そのものを表すので、開く前に範囲で絞り込める）。
 */
function readRecordsInRange(root: string, period: TokenUsagePeriod): readonly TokenUsageRecord[] {
  return fileNamesInRange(root, period).flatMap((fileName) =>
    readValidRecords(join(root, fileName)),
  )
}

/** 期間に入る日付のファイル名を古い順に並べる（読めないディレクトリは空）。 */
function fileNamesInRange(root: string, period: TokenUsagePeriod): readonly string[] {
  return dateFileNames(root).filter((name) => {
    const date = name.slice(0, 10)
    return date >= period.startDate && date <= period.endDate
  })
}

/** 1ファイルの行を検証して返す（{@link tokenUsageRecordSchema} を通らない行は1行ずつ落とす）。 */
function readValidRecords(path: string): readonly TokenUsageRecord[] {
  return readJsonLines(path).flatMap((raw) => {
    const record = tokenUsageRecordSchema.safeParse(raw)
    return record.success ? [record.data] : []
  })
}
