// 雑談と仕事の会話のアーカイブ。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/chat-archive/<パック名>/<YYYY-MM-DD>.jsonl` で、パックごと・日ごとに分け、`cwd` には依存させない。
// 雑談の依頼に添えた画像の原寸は、同じパックの `images/<YYYY-MM-DD>-<id>.<拡張子>` に1枚1ファイルで書き、`pruneChatImages` が期限を過ぎたものを消す。
// 画像は読み戻さない（行の `imageFiles` も読まないので、指す画像が消えていても行は読める）。
// 書き出してよい範囲・読み戻して渡してよい範囲は `docs/coding-standards.md`「会話内容の扱い」の例外の表が決めている。
//
// 何を残すか・いつ書くかの判断はここが決めない。
// ここが持つのは「どこに・どんな形で書くか」で、1件を1行の JSONL へ変換して追記するだけ。
//
// 書けなくても例外を投げない。
//
// 直近の窓を読む口は `readRecent` の1つだけ。
// 読んだものの行き先は雑談と仕事のセッションの `systemPrompt` だけで、画面にも手続きの応答にも stderr にも出さない。
// どこまで読むかは呼ぶ側が渡すバイト数で、ここは遡って集めることと並べ替えだけをする（文面を読んで載せる・載せないを決めない）。
//
// `kept.jsonl`（「残す」旗の索引）は書きも読みもしない。
// 過去に書かれたファイルが残っていても消さず、単に読まない。

import { readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import {
  type CharacterPackName,
  parseCharacterPackName,
} from "../../../shared/character-pack/character.ts"
import type { Expression } from "../../../shared/character-pack/expression.ts"
import { byteLength } from "../../../shared/utils/byte-length.ts"
import {
  appendJsonLine,
  dateFileNames,
  dateFileNamesBetween,
  dateFilePath,
  readJsonLines,
} from "../../adapter/lib/jsonl.ts"
import { isMissingFileError } from "../../adapter/lib/missing-file-error.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import type {
  ChatArchive,
  ChatArchiveEntry,
  ChatArchiveLine,
  ChatArchiveLineOrigin,
  ChatArchiveRecentEntry,
  ChatReadbackLimits,
  ChatUnconsolidatedBatch,
  ChatUnconsolidatedEntry,
  ChatUnconsolidatedLimits,
} from "../core/chat-archive-port.ts"
import { takeWithinBytes } from "../core/chat-byte-budget.ts"
import { isAfterAt, isBeforeAt } from "../core/chat-instant-order.ts"
import type { ChatFoldPoint } from "../core/chat-memory.ts"
import { CHAT_IMAGE_DIR_NAME, writeChatImage } from "./chat-archive-image.ts"

/** 雑談の画像を残す日数。名前の先頭の日付がこれより古いファイルは消す。 */
const CHAT_IMAGE_RETENTION_DAYS = 7

/** {@link writeChatImage} が書く名前の形。掃除はこの形のファイルにだけ触る。 */
const CHAT_IMAGE_FILE_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}-[0-9a-f-]{36}\.(?:png|jpg|gif|webp)$/

/** 行の形の版。形を変えたら上げ、古い行と見分ける。書くときは常にこの版。 */
const ARCHIVE_FORMAT_VERSION = 2 satisfies number

/** 読み戻しがまだ通す旧版（`mode`・`kind`・`project` を持たない雑談の行）。 */
const ARCHIVE_FORMAT_VERSION_V1 = 1 satisfies number

/**
 * 読み戻すときに要る鍵だけを検査する（`v` が知らない版・鍵が足りない行はここで落ちる）。
 * `v:1`（`mode`・`kind`・`project` を持たない雑談の行）と `v:2` の両方を通す。
 * `expression`・`images`・`imageFiles` は読まないので、形も見ない。
 * `v:1` の行は雑談として扱い、行の種類は `speaker` から決める。
 */
const archiveLineSchema = z.object({
  v: z.union([z.literal(ARCHIVE_FORMAT_VERSION_V1), z.literal(ARCHIVE_FORMAT_VERSION)]),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  speaker: z.enum(["user", "character"]),
  text: z.string(),
  // `v:1` の行はキー自体を持たないので `.optional()`。`project` は `v:2` でも仕事の行だけが持つ。
  mode: z.enum(["chat", "work"]).optional(),
  kind: z.enum(["request", "speech", "conclusion"]).optional(),
  project: z.string().optional(),
})

/** 置き場の親（`~/.tsukumo/chat-archive`）。書き込んでよいのはこの下だけ。 */
export function chatArchiveDir(): string {
  return tsukumoHomePath("chatArchive")
}

/**
 * パック1つぶんのアーカイブ（日ごとの会話と、同じディレクトリのほかのファイル）をディレクトリごと消す。
 * 同じ名前で作り直したパックが、消したパックとの会話を読み戻さないため。
 * 無い・消せないときも何もせず続ける。
 */
export function discardChatArchive(
  packName: CharacterPackName,
  root: string = chatArchiveDir(),
): void {
  try {
    rmSync(join(root, packName), { recursive: true, force: true })
  } catch {
    // 消せないだけ。パックはもう一覧に無いので、次に同じ名前で作るまで読まれない。
  }
}

/**
 * 今日（`today`。`YYYY-MM-DD`）から数えて {@link CHAT_IMAGE_RETENTION_DAYS} 日を過ぎた日付の、雑談の画像を全パックぶん消す。
 * 期限は名前の先頭の日付だけで決め、ファイルの時刻は見ない。{@link CHAT_IMAGE_FILE_NAME_PATTERN} の形でないファイルには触らない。
 * 置き場が無いのは失敗ではない。読めない・消せないときは `onFailure` に渡して続ける。
 */
export function pruneChatImages(
  today: string,
  onFailure: (error: unknown) => void,
  root: string = chatArchiveDir(),
): void {
  const oldestKept = Temporal.PlainDate.from(today)
    .subtract({ days: CHAT_IMAGE_RETENTION_DAYS })
    .toString()
  for (const packName of entryNames(root, onFailure)) {
    if (parseCharacterPackName(packName) === undefined) {
      continue
    }
    const dir = join(root, packName, CHAT_IMAGE_DIR_NAME)
    for (const name of entryNames(dir, onFailure)) {
      if (!CHAT_IMAGE_FILE_NAME_PATTERN.test(name) || name.slice(0, 10) >= oldestKept) {
        continue
      }
      try {
        rmSync(join(dir, name), { force: true })
      } catch (error) {
        onFailure(error)
      }
    }
  }
}

/**
 * アーカイブの読み書き口を作る。`root` は置き場の親（既定は {@link chatArchiveDir}）。
 *
 * 1つの口を複数のパック・複数の日にまたいで使い回せる。
 * `append` のたびに `packName` と `entry.at`（ローカル日付）から行き先のパスを組み立てるので、パックの切り替えをまたいでも作り直す必要が無い。
 */
export function createChatArchive(root: string = chatArchiveDir()): ChatArchive {
  const appendedBytes = new Map<string, number>()
  return {
    append: (packName, entry) => {
      const written = appendJsonLine(
        dateFilePath(join(root, packName), localDateKey(entry.at)),
        toArchiveRecord(packName, entry),
      )
      if (written) {
        appendedBytes.set(packName, (appendedBytes.get(packName) ?? 0) + byteLength(entry.text))
      }
    },
    appendedBytes: (packName) => appendedBytes.get(packName) ?? 0,
    writeImage: (packName, image) => writeChatImage(root, packName, image),
    readRecent: (packName, limits) => readReadback(root, packName, limits),
    unconsolidated: (packName, limits, after) => readUnconsolidated(root, packName, limits, after),
  }
}

/**
 * JSONL の1行の形（正典は `docs/architecture/chat-mode.md`「会話のアーカイブ」の表）。tsukumo の内部の型をそのまま書き出さない。
 * `speaker` は `kind` から決まる（`request` は利用者、`speech`・`conclusion` はキャラクター）。
 * `expression` / `images` / `imageFiles` / `project` のどれを持つかは `kind` と `mode` が決めるので、
 * 値を渡すたびに持たない鍵へ明示的に `undefined` を渡す。
 */
type ArchiveRecord = {
  readonly v: typeof ARCHIVE_FORMAT_VERSION
  readonly at: string
  readonly pack: string
  readonly mode: "chat" | "work"
  readonly project: string | undefined
  readonly kind: "request" | "speech" | "conclusion"
  readonly speaker: "user" | "character"
  readonly text: string
  readonly expression: Expression | undefined
  readonly images: number | undefined
  readonly imageFiles: readonly string[] | undefined
}

/**
 * {@link ChatArchiveEntry} を書き出す形へ変換する。
 * `images` は依頼の行だけ、`imageFiles` は雑談の依頼の行だけ、`expression` はセリフの行だけ、`project` は仕事の行だけが持つ
 * （`JSON.stringify` は値が `undefined` のキーを落とす）。
 */
function toArchiveRecord(packName: CharacterPackName, entry: ChatArchiveEntry): ArchiveRecord {
  return {
    v: ARCHIVE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
    pack: packName,
    mode: entry.mode,
    project: entry.mode === "work" ? entry.project : undefined,
    kind: entry.kind,
    speaker: entry.kind === "request" ? "user" : "character",
    text: entry.text,
    expression: entry.kind === "speech" ? entry.expression : undefined,
    images: entry.kind === "request" ? entry.images : undefined,
    imageFiles: entry.kind === "request" && entry.mode === "chat" ? entry.imageFiles : undefined,
  }
}

/** ディレクトリの中の名前。無ければ空で、それ以外で読めなければ `onFailure` に渡して空を返す。 */
function entryNames(dir: string, onFailure: (error: unknown) => void): readonly string[] {
  try {
    return readdirSync(dir)
  } catch (error) {
    if (!isMissingFileError(error)) {
      onFailure(error)
    }
    return []
  }
}

/** 直近の窓を読む（{@link ChatArchive.readRecent} の実装）。 */
function readReadback(
  root: string,
  packName: CharacterPackName,
  limits: ChatReadbackLimits,
): readonly ChatArchiveRecentEntry[] {
  const dir = join(root, packName)
  return readRecentEntries(dir, limits.recentBytes).map(recentEntryOf)
}

/**
 * 直近の会話を新しいほうから遡って集める（返すのは古い→新しいの順）。
 *
 * ディレクトリの日付のファイル名を降順に並べ、各ファイルは末尾の行から遡る。
 * 文面のバイト数の合計が `limitBytes` に届いたところでそれ以上は読まないので、アーカイブが何年ぶん増えても読む量は変わらない。
 *
 * 溢れる1件は載せない。1件だけで `limitBytes` を超える行が先頭に来たときは空を返す（行の途中で切るくらいなら逐語なしで始める）。
 */
function readRecentEntries(dir: string, limitBytes: number): readonly TimedEntry[] {
  return readEntriesBackward(dir, newestFirstFileNames(dir), limitBytes)
}

/**
 * 渡された順のファイルを、各ファイルは末尾の行から遡って集める（返すのは古い→新しいの順）。
 * 文面のバイト数の合計が `limitBytes` に届いたところでそれ以上は読まない（残りのファイルは開かない）。
 * 切り方は1件を単位にし、溢れる1件は載せない。
 */
function readEntriesBackward(
  dir: string,
  fileNames: readonly string[],
  limitBytes: number,
): readonly TimedEntry[] {
  function* newestFirst(): Generator<TimedEntry> {
    for (const fileName of fileNames) {
      for (const raw of readJsonLines(join(dir, fileName)).toReversed()) {
        const timed = toTimedEntry(raw)
        if (timed !== undefined) {
          yield timed
        }
      }
    }
  }

  const { taken } = takeWithinBytes(newestFirst(), {
    limitBytes,
    sizeOf: timedEntryBytes,
    whenFirstExceeds: "stop",
  })
  return taken.toReversed()
}

function timedEntryBytes(timed: TimedEntry): number {
  return byteLength(timed.line.text)
}

/** 日付のファイル名だけを新しい順に並べる（読めないディレクトリは空）。 */
function newestFirstFileNames(dir: string): readonly string[] {
  return dateFileNames(dir).toReversed()
}

/**
 * JSONL の1行を、載せる形（行の種類・文面・雑談か仕事か）へ畳む。
 * 壊れた JSON・知らない版・鍵が足りない行と、`project` を持たない仕事の行は undefined。
 *
 * `expression` と `images` はここで読まない（読み戻して渡すのは文面と話者の別だけ）。
 */
function toTimedEntry(raw: unknown): TimedEntry | undefined {
  const record = archiveLineSchema.safeParse(raw)
  if (!record.success) {
    return undefined
  }
  const { at, speaker, text, mode, kind, project } = record.data
  const origin: ChatArchiveLineOrigin | undefined =
    mode !== "work" ? { mode: "chat" } : project === undefined ? undefined : { mode, project }
  if (origin === undefined) {
    return undefined
  }
  return {
    at,
    line: { kind: kind ?? (speaker === "user" ? "request" : "speech"), text, origin },
  }
}

/**
 * 載せる形に、索引と突き合わせるための時刻を添えたもの。
 * `at` は外へ出さない（{@link ChatArchiveRecentEntry} が持つのは日付までで、時刻は渡さない）。
 */
type TimedEntry = {
  readonly at: string
  readonly line: ChatArchiveLine
}

/** 読み戻す1件にする。日付は `at` の頭10文字で、行だけで意味が決まる（ファイル名には頼らない）。 */
function recentEntryOf(timed: TimedEntry): ChatArchiveRecentEntry {
  return { ...timed.line, date: timed.at.slice(0, 10) }
}

/**
 * 定着の入力の行を読む（{@link ChatArchive.unconsolidated} の実装）。
 * `after` の時刻より後で、直近の窓（{@link readRecentEntries} が拾う範囲）の外にある行だけを、古いほうから `maxBytes` まで集める。
 * `after` の日付より前のファイルは開かない。
 */
function readUnconsolidated(
  root: string,
  packName: CharacterPackName,
  limits: ChatUnconsolidatedLimits,
  after: ChatFoldPoint,
): ChatUnconsolidatedBatch {
  const dir = join(root, packName)
  const afterAt = after.kind === "through" ? after.at : undefined
  const windowStartAt = readRecentEntries(dir, limits.recentBytes).at(0)?.at

  const all = dateFileNamesBetween(dir, afterAt?.slice(0, 10), undefined).flatMap((fileName) =>
    readJsonLines(join(dir, fileName)).flatMap((raw) => {
      const entry = toTimedEntry(raw)
      return entry === undefined ? [] : [entry]
    }),
  )

  function* untilWindow(): Generator<TimedEntry> {
    for (const timed of all) {
      if (afterAt !== undefined && !isAfterAt(timed.at, afterAt)) {
        continue
      }
      if (windowStartAt !== undefined && !isBeforeAt(timed.at, windowStartAt)) {
        return
      }
      yield timed
    }
  }

  // 先頭の1件だけで maxBytes を超えるときは、切らずにその1件だけを単独で渡す。
  // 行の途中では切らないまま、その回で必ず前へ進めるため。
  const { taken, usedBytes, overflowed } = takeWithinBytes(untilWindow(), {
    limitBytes: limits.maxBytes,
    sizeOf: timedEntryBytes,
    whenFirstExceeds: "take",
  })
  const entries: readonly ChatUnconsolidatedEntry[] = taken.map((timed) => ({
    ...timed.line,
    at: timed.at,
  }))
  return {
    entries,
    usedBytes,
    overflowed,
  }
}
