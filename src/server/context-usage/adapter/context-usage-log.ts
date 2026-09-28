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

import { join } from "node:path"

import {
  CONTEXT_USAGE_FORMAT_VERSION,
  type ContextUsageRecord,
} from "../../../shared/context-usage/context-usage-record.ts"
import { appendJsonLine } from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { ContextUsageEntry, ContextUsageLog } from "../core/context-usage.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/context-usage/`）。 */
const CONTEXT_USAGE_DIR_NAME = "context-usage"

/** 書き込んでよいのはこの下だけ。 */
export function contextUsageDir(): string {
  return join(tsukumoHomeDir(), CONTEXT_USAGE_DIR_NAME)
}

/**
 * 記録の書き込み口を作る。`root` は置き場（既定は {@link contextUsageDir}）。
 * 1つの口を日をまたいで使い回せる（`append` のたびに `entry.at` から行き先を組み立てる）。
 */
export function createContextUsageLog(root: string = contextUsageDir()): ContextUsageLog {
  return {
    append: (entry) => {
      appendJsonLine(join(root, `${localDateKey(entry.at)}.jsonl`), toRecord(entry))
    },
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
