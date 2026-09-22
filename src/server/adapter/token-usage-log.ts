// トークン消費の記録（何にどれだけ使ったかを残す）。ファイルに触るのはここだけ
// （原則3。1ファイル = 1つの境界）。置き場は `~/.tsukumo/token-usage/<YYYY-MM-DD>.jsonl` で、
// **日付だけで分ける** — 使用量はキャラクターパックに依らないので、パックごとに分けると
// 「その日いくら使ったか」を出すのに全部のディレクトリを混ぜ直すことになる。`cwd` にも
// 依存させない（どのプロジェクトから起こしても同じ場所に積む）。
//
// **何をいつ書くかの判断はここが決めない。** 判断（累計から増分を取る・増分が無い回は書かない・
// 期間で切って軸ごとに畳む）は `src/server/core/session-manager.ts` と
// `src/server/core/token-usage.ts` が持ち、ここが持つのは「どこに・どんな形で書くか」と
// 「日付の範囲からどのファイルを開くか」だけ（`chat-archive.ts` と同じ切り分け）。
//
// **1行に文字列で入るのは時刻・セッションID・モード・モデルの名前・ツールの名前だけ。** 依頼の
// 文面・セリフ・ツールの引数と結果は通らない（渡される {@link TokenUsageEntry} にそもそも口が
// 無く、ツールの結果は長さ（数）に畳まれてから届く。`docs/coding-standards.md`「会話内容の扱い」）。
// **読むときも同じ** — 検証して素通しするだけで、ログにも呼び出し元にも文面を足さない。
//
// 書けなくても・読めなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。**壊れた行・版が違う行は読まずに落とす**
// （`chat-archive.ts` の `archiveLineSchema` と同じ手。1行ずつ検証するので被害が1行に収まる）。

import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { z } from "zod"

import { TOKEN_USAGE_FORMAT_VERSION, type TokenUsageRecord } from "../../shared/token-usage.ts"
import {
  type TokenUsageEntry,
  type TokenUsageLog,
  type TokenUsagePeriod,
} from "../core/token-usage.ts"
import { isoWithOffset, localDateKey } from "./local-time.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/token-usage/`）。 */
const TOKEN_USAGE_DIR_NAME = "token-usage"

/** 読み書きするファイルの名前（`YYYY-MM-DD.jsonl`）。**これ以外のファイルは読まない。** */
const TOKEN_USAGE_FILE_NAME = /^\d{4}-\d{2}-\d{2}\.jsonl$/

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
 * 記録の1行の形（{@link TokenUsageRecord} と同じ鍵）。**`v` が
 * {@link TOKEN_USAGE_FORMAT_VERSION} と違う行はここで落ちる**（版1の行を残す価値が無いという
 * 判断。「内訳を空として読む」ことはしない）。
 */
const tokenUsageRecordSchema = z.object({
  v: z.literal(TOKEN_USAGE_FORMAT_VERSION),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  sessionId: z.string(),
  mode: z.enum(["work", "chat"]),
  models: z.array(modelTokenUsageSchema),
  breakdown: z.object({ main: scopeUsageSchema, subagent: scopeUsageSchema }),
})

/** 書き込んでよいのはこの下だけ（`chatArchiveDir` と同じ親）。 */
export function tokenUsageDir(): string {
  return join(tsukumoHomeDir(), TOKEN_USAGE_DIR_NAME)
}

/**
 * 記録の読み書き口を作る。`root` は置き場（既定は {@link tokenUsageDir}）で、差し替えられるのは
 * テストがホームを汚さないためにある（`createChatArchive` の `root` と同じ手）。
 *
 * **1つの口を日をまたいで使い回せる**——`append` のたびに `entry.at` から行き先を組み立てるので、
 * 日付が変われば次の行から新しいファイルに積む。
 */
export function createTokenUsageLog(root: string = tokenUsageDir()): TokenUsageLog {
  return {
    append: (entry) => {
      const date = new Date(entry.at)
      appendLine(join(root, `${localDateKey(date)}.jsonl`), toRecord(date, entry))
    },
    readRange: (period) => readRecordsInRange(root, period),
  }
}

/** 1行を追記する。ディレクトリが無ければ作る。失敗したその回は諦めて次へ進む。 */
function appendLine(path: string, record: TokenUsageRecord): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(record)}\n`)
  } catch {
    // 書けなかった回は諦めて次へ進む。
  }
}

/** 1ターンぶんの記録を、書き出す行（`src/shared/token-usage.ts`）へ変換する。 */
function toRecord(date: Date, entry: TokenUsageEntry): TokenUsageRecord {
  return {
    v: TOKEN_USAGE_FORMAT_VERSION,
    at: isoWithOffset(date),
    sessionId: entry.sessionId,
    mode: entry.mode,
    models: entry.models,
    breakdown: entry.breakdown,
  }
}

/**
 * 期間に入る日付のファイルだけを開き、古い→新しい順に行を集める（`TokenUsageLog.readRange` の
 * 実装）。**期間の外のファイルは開かない** — ファイル名が `YYYY-MM-DD.jsonl` で日付そのものを
 * 表すので、開く前に範囲で絞り込める（`chat-archive.ts` の走査と同じく、要らないファイルを
 * 開かないのがこの口の要点）。
 */
function readRecordsInRange(root: string, period: TokenUsagePeriod): readonly TokenUsageRecord[] {
  return fileNamesInRange(root, period).flatMap((fileName) =>
    readValidRecords(join(root, fileName)),
  )
}

/** 期間に入る日付のファイル名を古い順に並べる（読めないディレクトリは空）。 */
function fileNamesInRange(root: string, period: TokenUsagePeriod): readonly string[] {
  try {
    return readdirSync(root)
      .filter((name) => TOKEN_USAGE_FILE_NAME.test(name))
      .filter((name) => {
        const date = name.slice(0, 10)
        return date >= period.startDate && date <= period.endDate
      })
      .sort()
  } catch {
    return []
  }
}

/**
 * 1ファイルの行を検証して返す（{@link tokenUsageRecordSchema} を通らない行——壊れた JSON・
 * 版が違う・鍵が足りない——は1行ずつ落とす。JSONL は壊れても被害が1行）。
 */
function readValidRecords(path: string): readonly TokenUsageRecord[] {
  return readLines(path).flatMap((line) => {
    const record = tokenUsageRecordSchema.safeParse(parseJson(line))
    return record.success ? [record.data] : []
  })
}

/** 1ファイルの行（読めないファイルは空。空行は落とす。`chat-archive.ts` の走査と同じ手）。 */
function readLines(path: string): readonly string[] {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line !== "")
  } catch {
    return []
  }
}

/** JSON として読む（壊れていれば undefined。JSONL は壊れても被害が1行）。 */
function parseJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}
