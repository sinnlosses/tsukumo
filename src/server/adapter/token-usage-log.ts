// トークン消費の記録（何にどれだけ使ったかを残す）。ファイルに触るのはここだけ
// （原則3。1ファイル = 1つの境界）。置き場は `~/.tsukumo/token-usage/<YYYY-MM-DD>.jsonl` で、
// **日付だけで分ける** — 使用量はキャラクターパックに依らないので、パックごとに分けると
// 「その日いくら使ったか」を出すのに全部のディレクトリを混ぜ直すことになる。`cwd` にも
// 依存させない（どのプロジェクトから起こしても同じ場所に積む）。
//
// **何をいつ書くかの判断はここが決めない。** 判断（累計から増分を取る・増分が無い回は書かない）は
// `src/server/core/session-manager.ts` と `src/server/core/token-usage.ts` が持ち、ここが持つのは
// 「どこに・どんな形で書くか」だけ（`chat-archive.ts` と同じ切り分け）。
//
// **1行に文字列で入るのは時刻・セッションID・モード・モデルの名前・ツールの名前だけ。** 依頼の
// 文面・セリフ・ツールの引数と結果は通らない（渡される {@link TokenUsageEntry} にそもそも口が
// 無く、ツールの結果は長さ（数）に畳まれてから届く。`docs/coding-standards.md`「会話内容の扱い」）。
//
// 書けなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。

import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

import { TOKEN_USAGE_FORMAT_VERSION, type TokenUsageRecord } from "../../shared/token-usage.ts"
import { type TokenUsageEntry, type TokenUsageLog } from "../core/token-usage.ts"
import { isoWithOffset, localDateKey } from "./local-time.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/token-usage/`）。 */
const TOKEN_USAGE_DIR_NAME = "token-usage"

/** 書き込んでよいのはこの下だけ（`chatArchiveDir` と同じ親）。 */
export function tokenUsageDir(): string {
  return join(tsukumoHomeDir(), TOKEN_USAGE_DIR_NAME)
}

/**
 * 記録の書き込み口を作る。`root` は置き場（既定は {@link tokenUsageDir}）で、差し替えられるのは
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
