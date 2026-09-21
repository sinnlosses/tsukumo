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
//
// **「残す」旗は、同じディレクトリの `kept.jsonl` に「時刻だけ」の索引として積む**
// （`docs/requirements.md` 4.9「残すと決めた1往復は窓から落とさない」）。**日付のファイルは
// 書き換えない**（追記のまま）し、**文面も複製しない** — ディスクの上に会話は1つだけで、
// `docs/coding-standards.md`「会話内容の扱い」の例外表は2つのままになる。**どのやり取りに
// 立てるかの判断はここが決めない**（モデルが `keep` ツールを呼ぶかどうかだけ）。

import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { z } from "zod"

import { isCharacterPackName } from "../../shared/character.ts"
import { type Expression } from "../../shared/expression.ts"
import {
  type ChatArchive,
  type ChatArchiveEntry,
  type ChatArchiveReadback,
  type ChatArchiveRecentEntry,
  type ChatReadbackLimits,
} from "../core/session-driver.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-archive/`）。 */
const CHAT_ARCHIVE_DIR_NAME = "chat-archive"

/** 行の形の版（`docs/design.md` 7章）。形を変えたら上げ、古い行と見分ける。 */
const ARCHIVE_FORMAT_VERSION = 1 satisfies number

/** 読むファイルの名前（`YYYY-MM-DD.jsonl`）。**これ以外のファイルは読まない。** */
const ARCHIVE_FILE_NAME = /^\d{4}-\d{2}-\d{2}\.jsonl$/

/**
 * 「残す」旗の索引の名前（`docs/design.md` 7章）。**日付のファイルと同じディレクトリに置くが、
 * {@link ARCHIVE_FILE_NAME} を通らないので窓の側は読まない。**
 */
const KEPT_INDEX_FILE_NAME = "kept.jsonl"

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

/**
 * 索引の1行。**照合に使うのは `at` だけ**（`pack` は行だけで意味が決まるように書いてあるが、
 * 置き場所で既に決まっているので読まない）。
 */
const keptLineSchema = z.object({
  v: z.literal(ARCHIVE_FORMAT_VERSION),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
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
  // このターンで書いた行の宛先（旗が立ったときに索引へ写す。**文面は持たない**）。
  // ターンが終わるたびに空に戻すので、覚えている量は1ターンぶんで頭打ちになる。
  let turnMarks: readonly KeptMark[] = []
  // 旗が立ったか。**立てるのはターンの途中、書くのはターンの終わり**なので、ここで待たせる。
  let keeping = false

  return {
    append: (packName, entry) => {
      if (!isCharacterPackName(packName)) {
        return
      }
      const date = new Date(entry.at)
      const record = toArchiveRecord(packName, date, entry)
      appendLine(join(root, packName, `${localDateKey(date)}.jsonl`), record)
      turnMarks = [...turnMarks, { pack: packName, at: record.at }]
    },
    keep: () => {
      keeping = true
    },
    finishTurn: () => {
      if (keeping) {
        appendKeptMarks(root, turnMarks)
      }
      keeping = false
      turnMarks = []
    },
    readRecent: (packName, limits) => readReadback(root, packName, limits),
  }
}

/** 1行を追記する。ディレクトリが無ければ作る。失敗したその回は諦めて次へ進む。 */
function appendLine(path: string, record: KeptRecord | ArchiveRecord): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(record)}\n`)
  } catch {
    // 書けなかった回は諦めて次へ進む。
  }
}

/**
 * 旗の立ったターンの行を、パックごとの索引へ1行ずつ書く。**書くのは版・時刻・パック名だけ**で、
 * **文面は複製しない**（`docs/coding-standards.md`「会話内容の扱い」の例外表を増やさないため。
 * 文面はアーカイブの日付のファイルに1つだけある）。
 */
function appendKeptMarks(root: string, marks: readonly KeptMark[]): void {
  for (const mark of marks) {
    appendLine(join(root, mark.pack, KEPT_INDEX_FILE_NAME), {
      v: ARCHIVE_FORMAT_VERSION,
      at: mark.at,
      pack: mark.pack,
    })
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
 * 索引の1行の形（`docs/design.md` 7章）。**文面を持たない** — 指すだけで、会話はアーカイブの
 * 日付のファイルに1つだけある。
 */
type KeptRecord = {
  readonly v: typeof ARCHIVE_FORMAT_VERSION
  readonly at: string
  readonly pack: string
}

/** このターンで書いた1行の宛先（索引へ写すときの材料。**文面は持たない**）。 */
type KeptMark = {
  readonly pack: string
  readonly at: string
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
 * 直近の窓と、旗の付いたやり取りを1度に読む（{@link ChatArchive.readRecent} の実装）。
 *
 * **窓を先に決め、旗のほうは窓に入らなかった件だけを足す。** 順序が逆だと、旗の付いた件が
 * 窓の中にも外にも出て二重になる。
 */
function readReadback(
  root: string,
  packName: string,
  limits: ChatReadbackLimits,
): ChatArchiveReadback {
  if (!isCharacterPackName(packName)) {
    return { kept: [], recent: [] }
  }

  const dir = join(root, packName)
  const recent = readRecentEntries(dir, limits.recentBytes)
  return {
    kept: readKeptEntries(dir, limits.keptBytes, new Set(recent.map(entryKey))),
    recent: recent.map((timed) => timed.entry),
  }
}

/**
 * 直近の会話を新しいほうから遡って集める（返すのは古い→新しいの順）。
 *
 * **ディレクトリの日付のファイル名を降順に並べ、各ファイルは末尾の行から遡る。** 文面の
 * バイト数の合計が `limitBytes` に届いたところで**それ以上は読まない**ので、アーカイブが
 * 何年ぶん増えても読む量は変わらない。
 *
 * **溢れる1件は載せない**（`docs/requirements.md` 4.9「切り方」）。1件だけで `limitBytes` を
 * 超える行が先頭に来たときは空を返す——行の途中で切るくらいなら逐語なしで始める。
 */
function readRecentEntries(dir: string, limitBytes: number): readonly TimedEntry[] {
  // 新しい→古いの順に集め、最後にひっくり返して「古い→新しい」で返す。
  const collected: TimedEntry[] = []
  let usedBytes = 0
  for (const fileName of newestFirstFileNames(dir)) {
    let reachedLimit = false
    for (const line of [...readArchiveLines(join(dir, fileName))].reverse()) {
      const timed = toTimedEntry(line)
      if (timed === undefined) {
        continue
      }
      const bytes = byteLength(timed.entry.text)
      if (usedBytes + bytes > limitBytes) {
        reachedLimit = true
        break
      }
      collected.push(timed)
      usedBytes += bytes
    }
    if (reachedLimit) {
      break
    }
  }

  return [...collected].reverse()
}

/**
 * 旗の付いた行のうち、**窓に入らなかったもの**を新しいほうから集める（返すのは古い→新しいの
 * 順）。`taken` は窓に入った件の鍵で、ここに載っている件は飛ばす（**数にも入れない**）。
 *
 * **索引は時刻しか持たない**ので、指された日付のファイルを開いて文面を取りに行く。開くのは
 * **旗の立った日だけ**で、しかも `limitBytes` が埋まったところで止まるため、旗が何年ぶん
 * 増えても開くファイルの数は上限で頭打ちになる。
 *
 * **切り方は窓と同じ**（1件を単位にし、溢れる1件は載せない。そこで止める）。**同じ秒に
 * 書かれた行は区別しない** — 索引が指すのは「その秒に書いた行」で、隣の1件が一緒に載ることは
 * ありうる（足りないより多いほうへ倒す）。
 */
function readKeptEntries(
  dir: string,
  limitBytes: number,
  taken: ReadonlySet<string>,
): readonly ChatArchiveRecentEntry[] {
  const marks = readKeptMarks(join(dir, KEPT_INDEX_FILE_NAME))
  if (marks.size === 0) {
    return []
  }

  const seen = new Set(taken)
  const collected: ChatArchiveRecentEntry[] = []
  let usedBytes = 0
  for (const date of newestFirstMarkedDates(marks)) {
    let reachedLimit = false
    for (const line of [...readArchiveLines(join(dir, `${date}.jsonl`))].reverse()) {
      const timed = toTimedEntry(line)
      if (timed === undefined || !marks.has(timed.at) || seen.has(entryKey(timed))) {
        continue
      }
      const bytes = byteLength(timed.entry.text)
      if (usedBytes + bytes > limitBytes) {
        reachedLimit = true
        break
      }
      seen.add(entryKey(timed))
      collected.push(timed.entry)
      usedBytes += bytes
    }
    if (reachedLimit) {
      break
    }
  }

  return [...collected].reverse()
}

/** 索引が指している時刻（読めない行・知らない版は落とす。索引が無いときは空）。 */
function readKeptMarks(path: string): ReadonlySet<string> {
  const marks = readArchiveLines(path).flatMap((line) => {
    const record = keptLineSchema.safeParse(parseJson(line))
    return record.success ? [record.data.at] : []
  })
  return new Set(marks)
}

/** 旗の立った日付を新しい順に並べる（開くファイルをそこだけに絞る）。 */
function newestFirstMarkedDates(marks: ReadonlySet<string>): readonly string[] {
  return [...new Set([...marks].map((at) => at.slice(0, 10)))].sort().reverse()
}

/** 同じ1行を指す鍵（窓と旗で同じ件を二重に載せないため）。 */
function entryKey(timed: TimedEntry): string {
  return `${timed.at}\u0000${timed.entry.speaker}\u0000${timed.entry.text}`
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
function toTimedEntry(line: string): TimedEntry | undefined {
  const record = archiveLineSchema.safeParse(parseJson(line))
  if (!record.success) {
    return undefined
  }
  const { at, speaker, text } = record.data
  return { at, entry: { speaker, text, date: at.slice(0, 10) } }
}

/**
 * 載せる形に、**索引と突き合わせるための時刻**を添えたもの。`at` は外へ出さない
 * （{@link ChatArchiveRecentEntry} が持つのは日付までで、時刻は渡さない）。
 */
type TimedEntry = {
  readonly at: string
  readonly entry: ChatArchiveRecentEntry
}

/** JSON として読む（壊れていれば undefined。JSONL は壊れても被害が1行）。 */
function parseJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
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
