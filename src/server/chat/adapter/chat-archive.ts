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
// 古い会話は、エピソード索引（`episode.jsonl`）を引いてから、当たった範囲のファイルだけを開く。
// 索引を書くのは定着で、ここが持つのは置き場と形、`recallList` / `recallEpisode` での読み方だけ。
//
// `kept.jsonl`（「残す」旗の索引）は書きも読みもしない。
// 過去に書かれたファイルが残っていても消さず、単に読まない。

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import {
  type CharacterPackName,
  parseCharacterPackName,
} from "../../../shared/character-pack/character.ts"
import type { Expression } from "../../../shared/character-pack/expression.ts"
import {
  parsePromptImage,
  promptImageIdSchema,
  type PromptImageMediaType,
} from "../../../shared/session-driver/prompt-image.ts"
import { byteLength } from "../../../shared/utils/byte-length.ts"
import {
  appendJsonLine,
  dateFileNames,
  dateFileNamesBetween,
  dateFilePath,
  readJsonLines,
} from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type {
  ChatArchiveLine,
  ChatArchiveLineOrigin,
  ChatArchiveRecentEntry,
} from "../../session-driver/core/session-driver.ts"
import type {
  ChatArchive,
  ChatArchiveEntry,
  ChatArchiveImage,
  ChatArchiveImageWriteResult,
  ChatEpisodeDraft,
  ChatEpisodeReadResult,
  ChatEpisodeRecallListResult,
  ChatReadbackLimits,
  ChatUnconsolidatedBatch,
  ChatUnconsolidatedEntry,
  ChatUnconsolidatedLimits,
} from "../core/chat-archive-port.ts"
import { takeWithinBytes } from "../core/chat-byte-budget.ts"
import { episodeIdCounters } from "../core/chat-episode-id.ts"
import { scoreChatEpisodes, type ChatEpisodeRecord } from "../core/chat-episode-score.ts"
import { isAfterAt, isBeforeAt } from "../core/chat-instant-order.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-archive/`）。 */
const CHAT_ARCHIVE_DIR_NAME = "chat-archive"

/** パックの下の、雑談の画像の置き場のディレクトリ名。 */
const CHAT_IMAGE_DIR_NAME = "images"

/** 画像のファイルの拡張子。受け付ける形式の表（`PROMPT_IMAGE_MEDIA_TYPES`）と1対1。 */
const CHAT_IMAGE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
} as const satisfies Record<PromptImageMediaType, string>

/** 雑談の画像を残す日数。名前の先頭の日付がこれより古いファイルは消す。 */
const CHAT_IMAGE_RETENTION_DAYS = 7

/** {@link writeChatImage} が書く名前の形。掃除はこの形のファイルにだけ触る。 */
const CHAT_IMAGE_FILE_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}-[0-9a-f-]{36}\.(?:png|jpg|gif|webp)$/

/** 行の形の版。形を変えたら上げ、古い行と見分ける。書くときは常にこの版。 */
const ARCHIVE_FORMAT_VERSION = 2 satisfies number

/** 読み戻しがまだ通す旧版（`mode`・`kind`・`project` を持たない雑談の行）。 */
const ARCHIVE_FORMAT_VERSION_V1 = 1 satisfies number

/**
 * エピソード索引の名前。
 * {@link dateFileNames} が拾う `YYYY-MM-DD.jsonl` の形を通らないので、窓の走査には混ざらない。
 */
const EPISODE_INDEX_FILE_NAME = "episode.jsonl"

/** 思い出した記録の名前。 */
const RECALLED_FILE_NAME = "recalled.jsonl"

/** エピソード索引の行の形の版（`episode.jsonl` 自身の版で、アーカイブの行の `v` とは別の数え方）。 */
const EPISODE_FORMAT_VERSION = 2 satisfies number

/** 思い出した記録の行の形の版。 */
const RECALLED_FORMAT_VERSION = 1 satisfies number

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
  // `v:1` の行はキー自体を持たないので `.optional()`（値が来ても `undefined` になる境界ではなく、
  // キーの有無そのものが版の違いを表す）。`project` は `v:2` でも仕事の行だけが持つ。
  mode: z.enum(["chat", "work"]).optional(),
  kind: z.enum(["request", "speech", "conclusion"]).optional(),
  project: z.string().optional(),
})

/** エピソード索引の1行。読めない行・知らない版は飛ばす。 */
const episodeLineSchema = z.object({
  v: z.literal(EPISODE_FORMAT_VERSION),
  id: z.string(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  title: z.string(),
  gist: z.string(),
  cues: z.array(z.string()),
  weight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

/**
 * `episode.jsonl` の1行の形。
 * zod の推論のままだと書くとき（{@link ChatEpisodeDraft.cues}）と読むときで `cues` の可変・不変が食い違うので、手で定義する。
 */
type EpisodeLine = {
  readonly v: typeof EPISODE_FORMAT_VERSION
  readonly id: string
  readonly from: string
  readonly to: string
  readonly title: string
  readonly gist: string
  readonly cues: readonly string[]
  readonly weight: 1 | 2 | 3
}

/** 思い出した記録の1行。文面は持たない。 */
const recalledLineSchema = z.object({
  v: z.literal(RECALLED_FORMAT_VERSION),
  id: z.string(),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
})

/** 置き場の親（`~/.tsukumo/chat-archive`）。書き込んでよいのはこの下だけ。 */
export function chatArchiveDir(): string {
  return join(tsukumoHomeDir(), CHAT_ARCHIVE_DIR_NAME)
}

/**
 * パック1つぶんのアーカイブ（日ごとの会話・エピソード索引・思い出した記録）をディレクトリごと消す。
 * 同じ名前で作り直したパックが、消したパックとの会話を読み戻したり思い出したりしないため。
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
  return {
    append: (packName, entry) => {
      appendJsonLine(
        dateFilePath(join(root, packName), localDateKey(entry.at)),
        toArchiveRecord(packName, entry),
      )
    },
    writeImage: (packName, image) => writeChatImage(root, packName, image),
    readRecent: (packName, limits) => readReadback(root, packName, limits),
    unconsolidated: (packName, limits) => readUnconsolidated(root, packName, limits),
    appendEpisodes: (packName, episodes) => writeEpisodes(root, packName, episodes),
    recallList: (packName, keyword, limitBytes, now) =>
      readEpisodeCandidates(root, packName, keyword, limitBytes, now),
    recallEpisode: (packName, id, limitBytes, now) =>
      readEpisode(root, packName, id, limitBytes, now),
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

/**
 * 雑談の画像1枚を `<root>/<パック名>/images/<YYYY-MM-DD>-<id>.<拡張子>` に書く（{@link ChatArchive.writeImage} の実装）。
 * 日付は `at` のローカル日付で、期限切れの掃除は名前の先頭の日付だけを見る。
 * id・data URL のどちらかが通らないときはパスを組み立てずに失敗を返す。
 * 同じ名前のファイルがあれば上書きせずに失敗にする。
 */
function writeChatImage(
  root: string,
  packName: CharacterPackName,
  image: ChatArchiveImage,
): ChatArchiveImageWriteResult {
  const source = parsePromptImage(image.dataUrl)
  if (!promptImageIdSchema.safeParse(image.id).success || source === undefined) {
    return { kind: "failed", error: undefined }
  }
  const fileName = `${localDateKey(image.at)}-${image.id}.${CHAT_IMAGE_EXTENSIONS[source.mediaType]}`
  const dir = join(root, packName, CHAT_IMAGE_DIR_NAME)
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, fileName), Buffer.from(source.base64, "base64"), { flag: "wx" })
    return { kind: "written", fileName }
  } catch (error) {
    return { kind: "failed", error }
  }
}

/** ディレクトリの中の名前。無ければ空で、それ以外で読めなければ `onFailure` に渡して空を返す。 */
function entryNames(dir: string, onFailure: (error: unknown) => void): readonly string[] {
  try {
    return readdirSync(dir)
  } catch (error) {
    if (!(error instanceof Error && Reflect.get(error, "code") === "ENOENT")) {
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
 * まだどのエピソードにも入っていない行を読む（{@link ChatArchive.unconsolidated} の実装）。
 * 最後のエピソードの `to` より後（エピソードが無ければアーカイブの最初から。`to` の日付より前のファイルは開かない）で、直近の窓（{@link readRecentEntries} が拾う範囲）の外にある行だけを、古いほうから `maxBytes` まで集める。
 */
function readUnconsolidated(
  root: string,
  packName: CharacterPackName,
  limits: ChatUnconsolidatedLimits,
): ChatUnconsolidatedBatch {
  const dir = join(root, packName)
  const previousEpisode = readEpisodes(root, packName).at(-1)
  const afterAt = previousEpisode?.to
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
  return { entries, usedBytes, previousEpisodeTitle: previousEpisode?.title ?? "", overflowed }
}

/**
 * 定着ができたエピソードを追記する（{@link ChatArchive.appendEpisodes} の実装）。
 * `id` は `to` のローカル日付＋その日の通し番号（`-1` から）で振る。
 */
function writeEpisodes(
  root: string,
  packName: CharacterPackName,
  episodes: readonly ChatEpisodeDraft[],
): void {
  if (episodes.length === 0) {
    return
  }

  const path = episodeIndexPath(root, packName)
  const counters = episodeIdCounters(readEpisodes(root, packName))
  for (const draft of episodes) {
    const dateKey = draft.to.slice(0, 10)
    const next = (counters.get(dateKey) ?? 0) + 1
    counters.set(dateKey, next)
    appendJsonLine(path, {
      v: EPISODE_FORMAT_VERSION,
      id: `${dateKey}-${String(next)}`,
      from: draft.from,
      to: draft.to,
      title: draft.title,
      gist: draft.gist,
      cues: draft.cues,
      weight: draft.weight,
    } satisfies EpisodeLine)
  }
}

/**
 * 索引を引く言葉で採点し、点の高い順の候補を返す（{@link ChatArchive.recallList} の実装）。
 * ここは行を読んで採点に渡し、`recallListBytes` に収まるところで切るだけ。
 */
function readEpisodeCandidates(
  root: string,
  packName: CharacterPackName,
  keyword: string,
  limitBytes: number,
  now: Temporal.Instant,
): ChatEpisodeRecallListResult {
  const episodes = readEpisodes(root, packName)
  if (episodes.length === 0) {
    return { kind: "not-found" }
  }

  const counts = readRecalledCounts(root, packName)
  const scored = scoreChatEpisodes(
    episodes satisfies readonly ChatEpisodeRecord[],
    keyword,
    now,
    counts,
  )
  const { taken: candidates } = takeWithinBytes(scored, {
    limitBytes,
    sizeOf: (candidate) => byteLength(candidate.title) + byteLength(candidate.gist),
    whenFirstExceeds: "stop",
  })
  return candidates.length === 0 ? { kind: "not-found" } : { kind: "found", candidates }
}

/**
 * 1件のエピソードの範囲を逐語のまま読む（{@link ChatArchive.recallEpisode} の実装）。
 * 開いたら `recalled.jsonl` に記録する。
 * 文面は複製せず、`v`・`id`・時刻だけを追記する（文面を書くと `docs/coding-standards.md`「会話内容の扱い」の例外の表に無い複製になる）。
 */
function readEpisode(
  root: string,
  packName: CharacterPackName,
  id: string,
  limitBytes: number,
  now: Temporal.Instant,
): ChatEpisodeReadResult {
  const episode = readEpisodes(root, packName).find((record) => record.id === id)
  if (episode === undefined) {
    return { kind: "not-found" }
  }

  const dir = join(root, packName)
  const { entries, overflowed } = readEpisodeEntries(dir, episode.from, episode.to, limitBytes)
  if (entries.length === 0) {
    return { kind: "not-found" }
  }

  appendJsonLine(recalledPath(root, packName), {
    v: RECALLED_FORMAT_VERSION,
    id,
    at: isoWithOffset(now.epochMilliseconds),
  })
  return { kind: "found", entries, overflowed }
}

/** `~/.tsukumo/chat-archive/<パック名>/episode.jsonl` のパス。 */
function episodeIndexPath(root: string, packName: CharacterPackName): string {
  return join(root, packName, EPISODE_INDEX_FILE_NAME)
}

/** `~/.tsukumo/chat-archive/<パック名>/recalled.jsonl` のパス。 */
function recalledPath(root: string, packName: CharacterPackName): string {
  return join(root, packName, RECALLED_FILE_NAME)
}

/** エピソード索引を読み、読める行だけを書いた順のまま返す（読めない行・知らない版は飛ばす）。 */
function readEpisodes(root: string, packName: CharacterPackName): readonly EpisodeLine[] {
  return readJsonLines(episodeIndexPath(root, packName)).flatMap((raw) => {
    const record = episodeLineSchema.safeParse(raw)
    return record.success ? [record.data] : []
  })
}

/** 思い出した記録から、`id` ごとに開いた回数を数える（読めない行・知らない版は数えない）。 */
function readRecalledCounts(
  root: string,
  packName: CharacterPackName,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const raw of readJsonLines(recalledPath(root, packName))) {
    const record = recalledLineSchema.safeParse(raw)
    if (record.success) {
      counts.set(record.data.id, (counts.get(record.data.id) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * `from`〜`to`（両端含む）の逐語を古いほうから `limitBytes` まで読む。
 * 当たる日のファイルだけ開くので、アーカイブが何年ぶん増えても開くファイルの数は範囲の日数で頭打ちになる。
 */
function readEpisodeEntries(
  dir: string,
  from: string,
  to: string,
  limitBytes: number,
): { readonly entries: readonly ChatArchiveRecentEntry[]; readonly overflowed: boolean } {
  const fileNames = dateFileNamesBetween(dir, from.slice(0, 10), to.slice(0, 10))

  function* inRange(): Generator<TimedEntry> {
    for (const fileName of fileNames) {
      for (const raw of readJsonLines(join(dir, fileName))) {
        const timed = toTimedEntry(raw)
        if (timed !== undefined && !isBeforeAt(timed.at, from) && !isAfterAt(timed.at, to)) {
          yield timed
        }
      }
    }
  }

  const { taken, overflowed } = takeWithinBytes(inRange(), {
    limitBytes,
    sizeOf: timedEntryBytes,
    whenFirstExceeds: "stop",
  })
  return { entries: taken.map(recentEntryOf), overflowed }
}
