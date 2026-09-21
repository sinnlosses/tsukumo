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
// `docs/coding-standards.md`「エラーハンドリング」）。
//
// **読む口は `readRecent` の1つだけ**（2026-09-21 に足した。同じ日に決めた「読む口は持たない」を
// 覆している。理由と量の正典は `docs/requirements.md` 4.9「直近の会話は逐語のまま読み戻す」）。
// 読んだものの行き先は**雑談のセッションの `systemPrompt`** だけで、画面にも `error` フレームにも
// stderr にも出さない。**どこまで読むかは呼ぶ側が渡すバイト数**で、ここは遡って集めることと
// 並べ替えだけをする（文面を読んで載せる・載せないを決めない）。

import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { z } from "zod"

import { isCharacterPackName } from "../../shared/character.ts"
import { type Expression } from "../../shared/expression.ts"
import {
  type ChatArchive,
  type ChatArchiveEntry,
  type ChatArchiveRecentEntry,
} from "../core/session-driver.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-archive/`）。 */
const CHAT_ARCHIVE_DIR_NAME = "chat-archive"

/** 行の形の版（`docs/design.md` 7章）。形を変えたら上げ、古い行と見分ける。 */
const ARCHIVE_FORMAT_VERSION = 1 satisfies number

/** 読むファイルの名前（`YYYY-MM-DD.jsonl`）。**これ以外のファイルは読まない。** */
const ARCHIVE_FILE_NAME = /^\d{4}-\d{2}-\d{2}\.jsonl$/

/**
 * 読み戻すときに要る鍵だけを検査する（`v` が知らない版・鍵が足りない行はここで落ちる）。
 * **`expression` と `images` は読まないので、形も見ない。**
 */
const archiveLineSchema = z.object({
  v: z.literal(ARCHIVE_FORMAT_VERSION),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  speaker: z.enum(["user", "character"]),
  text: z.string(),
})

const textEncoder = new TextEncoder()

/**
 * 画面から作ったキャラクターパックと同じ親（`~/.tsukumo/chat-archive`）。書き込んでよいのは
 * この下だけ。
 */
export function chatArchiveDir(): string {
  return join(tsukumoHomeDir(), CHAT_ARCHIVE_DIR_NAME)
}

/**
 * アーカイブの読み書き口を作る（雑談モードのときだけ呼ばれる。`src/session-start.ts`）。
 * `root` は置き場の親（既定は {@link chatArchiveDir}）。差し替えられるのはテストがホームを
 * 汚さないためにある（`createChatSummary` の `root` と同じ手）。
 *
 * **1つの口を複数のパック・複数の日にまたいで使い回せる**——`append` のたびに `packName` と
 * `entry.at`（ローカル日付）から行き先のパスを組み立てる。パックの切り替え（`switch-character`）
 * をまたいでも起こし直す必要が無い。
 *
 * **書くのは `session-manager` から1件ずつ、読むのはセッションを起こすとき1回だけ**と持ち場が
 * 違うが、触るファイルは同じ1つなので境界は増やさない（原則3。`docs/design.md` 7章）。
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
    readRecent: (packName, limitBytes) => readRecentEntries(root, packName, limitBytes),
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

/**
 * 直近の会話を新しいほうから遡って集める（{@link ChatArchive.readRecent} の実装）。
 *
 * **ディレクトリの日付のファイル名を降順に並べ、各ファイルは末尾の行から遡る。** 文面の
 * バイト数の合計が `limitBytes` に届いたところで**それ以上は読まない**ので、アーカイブが
 * 何年ぶん増えても読む量は変わらない。
 *
 * **溢れる1件は載せない**（`docs/requirements.md` 4.9「切り方」）。1件だけで `limitBytes` を
 * 超える行が先頭に来たときは空を返す——行の途中で切るくらいなら逐語なしで始める。
 */
function readRecentEntries(
  root: string,
  packName: string,
  limitBytes: number,
): readonly ChatArchiveRecentEntry[] {
  if (!isCharacterPackName(packName)) {
    return []
  }

  const dir = join(root, packName)
  // 新しい→古いの順に集め、最後にひっくり返して「古い→新しい」で返す。
  const collected: ChatArchiveRecentEntry[] = []
  let usedBytes = 0
  for (const fileName of newestFirstFileNames(dir)) {
    let reachedLimit = false
    for (const line of [...readArchiveLines(join(dir, fileName))].reverse()) {
      const entry = toRecentEntry(line)
      if (entry === undefined) {
        continue
      }
      const bytes = byteLength(entry.text)
      if (usedBytes + bytes > limitBytes) {
        reachedLimit = true
        break
      }
      collected.push(entry)
      usedBytes += bytes
    }
    if (reachedLimit) {
      break
    }
  }

  return [...collected].reverse()
}

/** 日付のファイル名だけを新しい順に並べる（読めないディレクトリは空）。 */
function newestFirstFileNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
      .filter((name) => ARCHIVE_FILE_NAME.test(name))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

/** 1ファイルの行（読めないファイルは空。空行は落とす）。 */
function readArchiveLines(path: string): readonly string[] {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line !== "")
  } catch {
    return []
  }
}

/**
 * JSONL の1行を、載せる形（話者の別・文面・日付）へ畳む。**壊れた JSON・知らない版・鍵が
 * 足りない行は undefined**（1行ずつ落とす。JSONL は壊れても被害が1行）。
 *
 * **`expression` と `images` はここで読まない**（口が最初から渡さない。
 * `docs/requirements.md` 4.9）。日付は `at` の頭10文字で、**行だけで意味が決まる**
 * （ファイル名には頼らない）。
 */
function toRecentEntry(line: string): ChatArchiveRecentEntry | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return undefined
  }

  const record = archiveLineSchema.safeParse(parsed)
  if (!record.success) {
    return undefined
  }
  const { at, speaker, text } = record.data
  return { speaker, text, date: at.slice(0, 10) }
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

/** 文面の UTF-8 バイト数（読み戻す量を数える物差し。`docs/requirements.md` 4.9）。 */
function byteLength(text: string): number {
  return textEncoder.encode(text).length
}
