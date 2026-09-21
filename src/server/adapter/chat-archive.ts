// 雑談の会話のアーカイブ（`docs/design.md` 7章「雑談の会話のアーカイブはどこに置くか」）。
// ファイルに触るのはここだけ（原則3。1ファイル = 1つの境界）。置き場は
// `~/.tsukumo/chat-archive/<パック名>/<YYYY-MM-DD>.jsonl`、パックごと・日ごとで `cwd` には
// 依存させない。
//
// **何を残すか・いつ書くかの判断はここが決めない。** 判断は
// `src/server/core/session-manager.ts` の `receive` が持ち、ここが持つのは「どこに・どんな形で
// 書くか」——1件を1行の JSONL へ変換して追記するだけ（`docs/coding-standards.md`
// 「会話内容の扱い」とぶつからないための切り分け。`src/server/adapter/chat-summary.ts` と同じ形）。
//
// 書けなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。**読む口は持たない**（tsukumo 自身は
// 書いたものを読み返さない）。

import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

import { isCharacterPackName } from "../../shared/character.ts"
import { type Expression } from "../../shared/expression.ts"
import { type ChatArchive, type ChatArchiveEntry } from "../core/session-driver.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-archive/`）。 */
const CHAT_ARCHIVE_DIR_NAME = "chat-archive"

/** 行の形の版（`docs/design.md` 7章）。形を変えたら上げ、古い行と見分ける。 */
const ARCHIVE_FORMAT_VERSION = 1 satisfies number

/**
 * 画面から作ったキャラクターパックと同じ親（`~/.tsukumo/chat-archive`）。書き込んでよいのは
 * この下だけ。
 */
export function chatArchiveDir(): string {
  return join(tsukumoHomeDir(), CHAT_ARCHIVE_DIR_NAME)
}

/**
 * アーカイブの書き込み口を作る（雑談モードのときだけ呼ばれる。`src/session-start.ts`）。
 * `root` は書き込み先の親（既定は {@link chatArchiveDir}）。差し替えられるのはテストがホームを
 * 汚さないためにある（`createChatSummary` の `root` と同じ手）。
 *
 * **1つの口を複数のパック・複数の日にまたいで使い回せる**——`append` のたびに `packName` と
 * `entry.at`（ローカル日付）から行き先のパスを組み立てる。パックの切り替え（`switch-character`）
 * をまたいでも起こし直す必要が無い。
 */
export function createChatArchive(root: string = chatArchiveDir()): ChatArchive {
  return {
    append: (packName, entry) => {
      if (!isCharacterPackName(packName)) {
        return
      }
      const date = new Date(entry.at)
      const path = join(root, packName, `${localDateKey(date)}.jsonl`)
      appendLine(path, toArchiveRecord(packName, date, entry))
    },
  }
}

/** 1行を追記する。ディレクトリが無ければ作る。失敗したその回は諦めて次へ進む。 */
function appendLine(path: string, record: ArchiveRecord): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(record)}\n`)
  } catch {
    // 書けなかった回は諦めて次へ進む。
  }
}

/**
 * JSONL の1行の形（`docs/design.md` 7章の表）。**tsukumo の内部の型をそのまま書き出さない。**
 * `expression` / `images` は「無いかもしれない」プロパティなので `T | undefined` で持つ（`?:`
 * は使わない。`docs/coding-standards.md`「無いかもしれない値」）——どちらを持つかは `speaker`
 * が決めるので、値を渡すたびにもう片方へ明示的に `undefined` を渡す。
 */
type ArchiveRecord = {
  readonly v: typeof ARCHIVE_FORMAT_VERSION
  readonly at: string
  readonly pack: string
  readonly speaker: "user" | "character"
  readonly text: string
  readonly expression: Expression | undefined
  readonly images: number | undefined
}

/**
 * {@link ChatArchiveEntry} を書き出す形へ変換する。`images` は1枚以上あるときだけ、
 * `expression` はキャラクターの行だけが持つ（`JSON.stringify` は値が `undefined` のキーを
 * 落とすので、「持たないときは書かない」がそのまま実現できる）。
 */
function toArchiveRecord(packName: string, date: Date, entry: ChatArchiveEntry): ArchiveRecord {
  const base = {
    v: ARCHIVE_FORMAT_VERSION,
    at: isoWithOffset(date),
    pack: packName,
    speaker: entry.speaker,
    text: entry.text,
  } as const

  return entry.speaker === "user"
    ? { ...base, expression: undefined, images: entry.images }
    : { ...base, expression: entry.expression, images: undefined }
}

/** ローカル時刻での `YYYY-MM-DD`（日の境目はそのマシンのローカル時刻。`docs/design.md` 7章）。 */
function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** ISO 8601（オフセット付き）。行だけで時刻が決まる（`docs/design.md` 7章）。 */
function isoWithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const offset = `${sign}${pad(Math.trunc(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`
  const datePart = localDateKey(date)
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${datePart}T${timePart}${offset}`
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}
