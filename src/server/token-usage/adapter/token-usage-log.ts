// トークン消費の記録（何にどれだけ使ったかを残す）。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/token-usage/<YYYY-MM-DD>.jsonl` で、日付だけで分ける。
// 使用量はキャラクターパックに依らないので、パックごとに分けると「その日いくら使ったか」を出すのに全部のディレクトリを混ぜ直すことになる。
// 置き場は作業ツリーにも依存させない（どのプロジェクトから起こしても同じ場所に積む）。
// 作業ツリーが決めるのは、行に結ぶ着手中のタスクのIDと段だけ。
//
// 何をいつ書くかの判断はここが決めない。
// ここが持つのは「どこに・どんな形で書くか」と「日付の範囲からどのファイルを開くか」だけ。
//
// 1行に文字列で入るのは時刻・セッションID・モード・タスクID・段の名前・モデルの名前・ツールの名前だけ。
// 依頼の文面・セリフ・ツールの引数と結果は通らない（渡される `TokenUsageEntry` にそもそも口が無く、ツールの結果は長さ（数）に畳まれてから届く）。
// 読むときも検証して素通しするだけで、ログにも呼び出し元にも文面を足さない。
//
// 書けなくても・読めなくても例外を投げない。壊れた行・版が違う行は読まずに1行ずつ落とす。

import { readdirSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import {
  TOKEN_USAGE_FORMAT_VERSION,
  TOKEN_USAGE_LEGACY_FORMAT_VERSION,
  type TokenUsageRecord,
} from "../../../shared/token-usage/token-usage.ts"
import {
  appendJsonLine,
  dateFileNames,
  dateFilePath,
  readJsonLines,
  readValidLines,
} from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import { runGit } from "../../repository/adapter/git.ts"
import type { TokenUsageEntry, TokenUsageLog, TokenUsagePeriod } from "../core/token-usage.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/token-usage/`）。 */
const TOKEN_USAGE_DIR_NAME = "token-usage"

/** モデル1件ぶんの数（`ModelTokenUsage` と同じ鍵）。 */
const modelTokenUsageSchema = z.object({
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  thinkingTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  costUsd: z.number(),
})

/** assistant のステップの使用量（`StepTokenUsage` と同じ鍵）。 */
const stepTokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
})

/** ツール1種類ぶんの内訳（`ToolUsageCount` と同じ鍵）。 */
const toolUsageCountSchema = z.object({
  name: z.string(),
  calls: z.number(),
  resultBytes: z.number(),
})

/** 持ち場1つぶんの内訳（`ScopeUsage` と同じ鍵）。 */
const scopeUsageSchema = z.object({
  steps: z.number(),
  tokens: stepTokenUsageSchema,
  tools: z.array(toolUsageCountSchema),
})

/**
 * 記録の1行の形（{@link TokenUsageRecord} と同じ鍵）。
 * `v` が書く版と読める古い版（`taskId`・`stage` が無い版）のどちらでもない行はここで落ちる。
 * 古い版の行は `taskId`・`stage` を持たないものとして読む。
 */
const tokenUsageRecordSchema = z
  .object({
    v: z.literal([TOKEN_USAGE_FORMAT_VERSION, TOKEN_USAGE_LEGACY_FORMAT_VERSION]),
    at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
    sessionId: z.string(),
    mode: z.enum(["work", "chat"]),
    taskId: z.string().optional(),
    stage: z.string().optional(),
    models: z.array(modelTokenUsageSchema),
    breakdown: z.object({ main: scopeUsageSchema, subagent: scopeUsageSchema }),
  })
  .transform((row) => ({ ...row, taskId: row.taskId, stage: row.stage }))

/** 着手の印の置き場（作業ツリーの根から）。tw が置く。 */
const TASK_CLAIMS_DIR = join(".tw", "local", "task-open-claims")

/** 台帳の `lap` の出来事のうち、段を読むのに要る鍵。 */
const lapEventSchema = z.object({ event: z.literal("lap"), task: z.string(), stage: z.string() })

/** 書き込んでよいのはこの下だけ。 */
export function tokenUsageDir(): string {
  return join(tsukumoHomeDir(), TOKEN_USAGE_DIR_NAME)
}

/**
 * 着手の印（作業ツリーの根）と台帳（全作業ツリーが共有する git dir）の場所。
 * git の作業ツリーでなければ、記録にタスクは結ばない。
 */
export type TaskPlace = {
  readonly worktreeRoot: string
  readonly gitCommonDir: string
}

/** `cwd` から {@link TaskPlace} を git に尋ねる（起動時に1回）。git が無い・作業ツリーでないときは `undefined`。 */
export async function resolveTaskPlace(cwd: string): Promise<TaskPlace | undefined> {
  const [toplevel, common] = await Promise.all([
    runGit(cwd, ["rev-parse", "--show-toplevel"]),
    runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  ])
  if (toplevel.kind !== "output" || common.kind !== "output") {
    return undefined
  }
  const worktreeRoot = toplevel.stdout.trim()
  const gitCommonDir = common.stdout.trim()
  return worktreeRoot === "" || gitCommonDir === "" ? undefined : { worktreeRoot, gitCommonDir }
}

/**
 * 記録の読み書き口を作る。`place` は着手の印と台帳の場所（無ければタスクを結ばない）、`root` は置き場（既定は {@link tokenUsageDir}）。
 * 1つの口を日をまたいで使い回せる（`append` のたびに `entry.at` から行き先を組み立てる）。
 */
export function createTokenUsageLog(
  place: TaskPlace | undefined,
  root: string = tokenUsageDir(),
): TokenUsageLog {
  return {
    append: (entry) => {
      appendJsonLine(dateFilePath(root, localDateKey(entry.at)), toRecord(entry, place))
    },
    readRange: (period) => readRecordsInRange(root, period),
  }
}

/** 1ターンぶんの記録を、書き出す行（`TokenUsageRecord`）へ変換する。 */
function toRecord(entry: TokenUsageEntry, place: TaskPlace | undefined): TokenUsageRecord {
  const task = place === undefined ? undefined : readOpenTask(place, entry.at)
  return {
    v: TOKEN_USAGE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    mode: entry.mode,
    taskId: task?.taskId,
    stage: task?.stage,
    models: entry.models,
    breakdown: entry.breakdown,
  }
}

/**
 * 作業ツリーで着手中のタスクと、その段。
 * 着手の印がちょうど1件のときだけ結ぶ（0件は着手していない、2件以上はどれか決められない）。
 * 段は {@link latestLapStage}。読めなければ段だけ無い。
 */
function readOpenTask(
  place: TaskPlace,
  at: number,
): { readonly taskId: string; readonly stage: string | undefined } | undefined {
  const claims = listDir(join(place.worktreeRoot, TASK_CLAIMS_DIR))
  const taskId = claims.length === 1 ? claims[0] : undefined
  if (taskId === undefined) {
    return undefined
  }
  return { taskId, stage: latestLapStage(place.gitCommonDir, taskId, at) }
}

/**
 * タスクの最後の `lap` の段。台帳は月ごとのファイルなので、書く月に無ければ前月を読む。
 * 月をまたいで続くタスクと、月初でまだ当月の lap が出ていないターンが、月の中と同じ段になる。
 */
function latestLapStage(gitCommonDir: string, taskId: string, at: number): string | undefined {
  const thisMonth = Temporal.PlainDate.from(localDateKey(at)).toPlainYearMonth()
  return [thisMonth, thisMonth.subtract({ months: 1 })]
    .map((month) => lapStagesOf(gitCommonDir, month.toString(), taskId).at(-1))
    .find((stage) => stage !== undefined)
}

/** 台帳の1か月ぶん（`flow/<YYYY-MM>.jsonl`）にある、そのタスクの `lap` の段を書いた順に返す。 */
function lapStagesOf(gitCommonDir: string, month: string, taskId: string): readonly string[] {
  return readJsonLines(join(gitCommonDir, "task-workflow", "flow", `${month}.jsonl`)).flatMap(
    (raw) => {
      const parsed = lapEventSchema.safeParse(raw)
      return parsed.success && parsed.data.task === taskId ? [parsed.data.stage] : []
    },
  )
}

/** ディレクトリの中の名前（読めなければ空）。 */
function listDir(path: string): readonly string[] {
  try {
    return readdirSync(path)
  } catch {
    return []
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
  return readValidLines(path, tokenUsageRecordSchema)
}
