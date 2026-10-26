// トークン消費の記録（何にどれだけ使ったかを残す）。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/token-usage/<YYYY-MM-DD>.jsonl` で、日付だけで分ける。
// 使用量はキャラクターパックに依らないので、パックごとに分けると「その日いくら使ったか」を出すのに全部のディレクトリを混ぜ直すことになる。
// 置き場は作業ツリーにも依存させない（どのプロジェクトから起こしても同じ場所に積む）。
// 行に結ぶ着手中のタスクのIDと段は、tw の読む口から読む（`createOpenTaskReader`）。
//
// 何をいつ書くかの判断はここが決めない。
// ここが持つのは「どこに・どんな形で書くか」と「日付の範囲からどのファイルを開くか」だけ。
//
// 1行に文字列で入るのは時刻・セッションID・モード・タスクID・段の名前・モデルの名前・ツールの名前だけ。
// 依頼の文面・セリフ・ツールの引数と結果は通らない（渡される `TokenUsageEntry` にそもそも口が無く、ツールの結果は長さ（数）に畳まれてから届く）。
// 読むときも検証して素通しするだけで、ログにも呼び出し元にも文面を足さない。
//
// 書けなくても・読めなくても例外を投げない。壊れた行・版が違う行は読まずに1行ずつ落とす。

import {
  TOKEN_USAGE_FORMAT_VERSION,
  type TokenUsageRecord,
  tokenUsageRecordSchema,
} from "../../../shared/token-usage/token-usage.ts"
import { createDatedRecordLog, type DatedRecordLog } from "../../adapter/lib/dated-record-log.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import type { TokenUsageEntry, TokenUsageLog } from "../core/token-usage.ts"
import type { OpenTaskReader } from "./tw-claim-list.ts"

/**
 * 記録の読み書き口を作る。`openTask` はこの作業ツリーで着手中のタスクを読む口（{@link OpenTaskReader}）、`root` は置き場（既定は {@link tokenUsageDir}）。
 * 1つの口を日をまたいで使い回せる（`append` のたびに `entry.at` から行き先を組み立てる）。
 */
export function createTokenUsageLog(
  openTask: OpenTaskReader,
  root: string = tokenUsageDir(),
): TokenUsageLog & Pick<DatedRecordLog<TokenUsageRecord>, "flush" | "close" | "pruneExpired"> {
  const log = createDatedRecordLog(
    { schema: tokenUsageRecordSchema, retentionDays: undefined },
    root,
  )
  return {
    append: (entry) => {
      log.append(localDateKey(entry.at), [toRecord(entry, openTask)])
    },
    prefetchOpenTask: openTask.prefetch,
    flush: log.flush,
    close: log.close,
    pruneExpired: log.pruneExpired,
    readRange: (period) => log.readRange(period),
  }
}

/** 1ターンぶんの記録を、書き出す行（`TokenUsageRecord`）へ変換する。 */
/** 書き込んでよいのはこの下だけ。 */
function tokenUsageDir(): string {
  return tsukumoHomePath("tokenUsage")
}

function toRecord(entry: TokenUsageEntry, openTask: OpenTaskReader): TokenUsageRecord {
  const task = openTask.read()
  return {
    v: TOKEN_USAGE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    sessionId: entry.sessionId,
    mode: entry.mode,
    taskId: task?.taskId,
    stage: task?.stage,
    progressNudge: entry.progressNudge,
    models: entry.models,
    breakdown: entry.breakdown,
  }
}
