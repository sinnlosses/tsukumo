// 雑談と仕事の会話のアーカイブ。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/chat-archive/<パック名>/<YYYY-MM-DD>.jsonl` で、パックごと・日ごとに分け、`cwd` には依存させない。
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
// 定着をプロセスをまたいで1本にする錠（`consolidation.lock`）の置き場と取り方もここが持つ。
//
// `kept.jsonl`（「残す」旗の索引）は書きも読みもしない。
// 過去に書かれたファイルが残っていても消さず、単に読まない。

import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { z } from "zod"

import { isCharacterPackName } from "../../../shared/character-pack/character.ts"
import type { Expression } from "../../../shared/character-pack/expression.ts"
import { byteLength } from "../../../shared/utils/byte-length.ts"
import { appendJsonLine, dateFileNames, readJsonLines } from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type {
  ChatArchive,
  ChatArchiveEntry,
  ChatArchiveLine,
  ChatArchiveLineOrigin,
  ChatArchiveRecentEntry,
  ChatConsolidationLock,
  ChatEpisodeCandidate,
  ChatEpisodeDraft,
  ChatEpisodeReadResult,
  ChatEpisodeRecallListResult,
  ChatReadbackLimits,
  ChatUnconsolidatedBatch,
  ChatUnconsolidatedEntry,
  ChatUnconsolidatedLimits,
} from "../../session-driver/core/session-driver.ts"
import { scoreChatEpisodes, type ChatEpisodeRecord } from "../core/chat-episode-score.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-archive/`）。 */
const CHAT_ARCHIVE_DIR_NAME = "chat-archive"

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

/** 定着の錠の名前。 */
const CONSOLIDATION_LOCK_FILE_NAME = "consolidation.lock"

/** エピソード索引の行の形の版（`episode.jsonl` 自身の版で、アーカイブの行の `v` とは別の数え方）。 */
const EPISODE_FORMAT_VERSION = 2 satisfies number

/** 思い出した記録の行の形の版。 */
const RECALLED_FORMAT_VERSION = 1 satisfies number

/**
 * 読み戻すときに要る鍵だけを検査する（`v` が知らない版・鍵が足りない行はここで落ちる）。
 * `v:1`（`mode`・`kind`・`project` を持たない雑談の行）と `v:2` の両方を通す。
 * `expression` と `images` は読まないので、形も見ない。
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
 * 無い・消せないときも何もせず続ける。名前が {@link isCharacterPackName} を通らなければパスを組み立てない。
 */
export function discardChatArchive(packName: string, root: string = chatArchiveDir()): void {
  if (!isCharacterPackName(packName)) {
    return
  }

  try {
    rmSync(join(root, packName), { recursive: true, force: true })
  } catch {
    // 消せないだけ。パックはもう一覧に無いので、次に同じ名前で作るまで読まれない。
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
      if (!isCharacterPackName(packName)) {
        return
      }
      appendJsonLine(
        join(root, packName, `${localDateKey(entry.at)}.jsonl`),
        toArchiveRecord(packName, entry),
      )
    },
    readRecent: (packName, limits) => readReadback(root, packName, limits),
    unconsolidated: (packName, limits) => readUnconsolidated(root, packName, limits),
    appendEpisodes: (packName, episodes) => writeEpisodes(root, packName, episodes),
    recallList: (packName, keyword, limitBytes, now) =>
      readEpisodeCandidates(root, packName, keyword, limitBytes, now),
    recallEpisode: (packName, id, limitBytes, now) =>
      readEpisode(root, packName, id, limitBytes, now),
    lockConsolidation: (packName, staleAfterMs, now) =>
      lockConsolidation(root, packName, staleAfterMs, now),
  }
}

/**
 * JSONL の1行の形（正典は `docs/architecture/chat-mode.md`「雑談の会話のアーカイブ」の表）。tsukumo の内部の型をそのまま書き出さない。
 * `speaker` は `kind` から決まる（`request` は利用者、`speech`・`conclusion` はキャラクター）。
 * `expression` / `images` / `project` のどれを持つかは `kind` と `mode` が決めるので、
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
}

/**
 * {@link ChatArchiveEntry} を書き出す形へ変換する。
 * `images` は依頼の行だけ、`expression` はセリフの行だけ、`project` は仕事の行だけが持つ
 * （`JSON.stringify` は値が `undefined` のキーを落とす）。
 */
function toArchiveRecord(packName: string, entry: ChatArchiveEntry): ArchiveRecord {
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
  }
}

/** 直近の窓を読む（{@link ChatArchive.readRecent} の実装）。 */
function readReadback(
  root: string,
  packName: string,
  limits: ChatReadbackLimits,
): readonly ChatArchiveRecentEntry[] {
  if (!isCharacterPackName(packName)) {
    return []
  }

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
  // 新しい→古いの順に集め、最後にひっくり返して「古い→新しい」で返す。
  const collected: TimedEntry[] = []
  let usedBytes = 0
  for (const fileName of fileNames) {
    let reachedLimit = false
    for (const raw of [...readJsonLines(join(dir, fileName))].reverse()) {
      const timed = toTimedEntry(raw)
      if (timed === undefined) {
        continue
      }
      const bytes = byteLength(timed.line.text)
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

/** 日付のファイル名だけを新しい順に並べる（読めないディレクトリは空）。 */
function newestFirstFileNames(dir: string): readonly string[] {
  return [...dateFileNames(dir)].reverse()
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
 * 最後のエピソードの `to` より後（エピソードが無ければアーカイブの最初から）で、直近の窓（{@link readRecentEntries} が拾う範囲）の外にある行だけを、古いほうから `maxBytes` まで集める。
 */
function readUnconsolidated(
  root: string,
  packName: string,
  limits: ChatUnconsolidatedLimits,
): ChatUnconsolidatedBatch {
  if (!isCharacterPackName(packName)) {
    return { entries: [], usedBytes: 0, previousEpisodeTitle: "", overflowed: false }
  }

  const dir = join(root, packName)
  const previousEpisode = readEpisodes(root, packName).at(-1)
  const afterAt = previousEpisode?.to
  const windowStartAt = readRecentEntries(dir, limits.recentBytes).at(0)?.at

  const all = dateFileNames(dir).flatMap((fileName) => {
    const timed = readJsonLines(join(dir, fileName)).flatMap((raw) => {
      const entry = toTimedEntry(raw)
      return entry === undefined ? [] : [entry]
    })
    return timed
  })

  const entries: ChatUnconsolidatedEntry[] = []
  let usedBytes = 0
  let overflowed = false
  for (const timed of all) {
    if (afterAt !== undefined && !isAfterAt(timed.at, afterAt)) {
      continue
    }
    if (windowStartAt !== undefined && !isBeforeAt(timed.at, windowStartAt)) {
      break
    }
    const bytes = byteLength(timed.line.text)
    if (usedBytes + bytes > limits.maxBytes) {
      overflowed = true
      // 先頭の1件だけで maxBytes を超えるときは、切らずにその1件だけを単独で渡す。
      // 行の途中では切らないまま、その回で必ず前へ進めるため。
      if (entries.length === 0) {
        entries.push({ ...timed.line, at: timed.at })
        usedBytes += bytes
      }
      break
    }
    entries.push({ ...timed.line, at: timed.at })
    usedBytes += bytes
  }
  return { entries, usedBytes, previousEpisodeTitle: previousEpisode?.title ?? "", overflowed }
}

/**
 * 定着ができたエピソードを追記する（{@link ChatArchive.appendEpisodes} の実装）。
 * `id` は `to` のローカル日付＋その日の通し番号（`-1` から）で振る。
 */
function writeEpisodes(
  root: string,
  packName: string,
  episodes: readonly ChatEpisodeDraft[],
): void {
  if (!isCharacterPackName(packName) || episodes.length === 0) {
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
  packName: string,
  keyword: string,
  limitBytes: number,
  now: Temporal.Instant,
): ChatEpisodeRecallListResult {
  if (!isCharacterPackName(packName)) {
    return { kind: "not-found" }
  }

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
  const candidates = trimCandidatesToBytes(scored, limitBytes)
  return candidates.length === 0 ? { kind: "not-found" } : { kind: "found", candidates }
}

/**
 * 1件のエピソードの範囲を逐語のまま読む（{@link ChatArchive.recallEpisode} の実装）。
 * 開いたら `recalled.jsonl` に記録する。
 * 文面は複製せず、`v`・`id`・時刻だけを追記する（文面を書くと `docs/coding-standards.md`「会話内容の扱い」の例外の表に無い複製になる）。
 */
function readEpisode(
  root: string,
  packName: string,
  id: string,
  limitBytes: number,
  now: Temporal.Instant,
): ChatEpisodeReadResult {
  if (!isCharacterPackName(packName)) {
    return { kind: "not-found" }
  }

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
function episodeIndexPath(root: string, packName: string): string {
  return join(root, packName, EPISODE_INDEX_FILE_NAME)
}

/**
 * 定着の錠を取る（{@link ChatArchive.lockConsolidation} の実装）。
 * 錠のファイルを排他で作れたときだけ取れる。中身は書いた時刻だけで、古さはファイルの更新時刻で測る。
 */
function lockConsolidation(
  root: string,
  packName: string,
  staleAfterMs: number,
  now: Temporal.Instant,
): ChatConsolidationLock | undefined {
  if (!isCharacterPackName(packName)) {
    return undefined
  }

  const path = join(root, packName, CONSOLIDATION_LOCK_FILE_NAME)
  if (createLockFile(path, now)) {
    return releasableLock(path)
  }
  if (!isStaleLock(path, staleAfterMs, now)) {
    return undefined
  }
  removeLockFile(path)
  return createLockFile(path, now) ? releasableLock(path) : undefined
}

/** 錠のファイルを排他（`wx`）で作る。既にある・作れないときは `false`。 */
function createLockFile(path: string, now: Temporal.Instant): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, isoWithOffset(now.epochMilliseconds), { flag: "wx" })
    return true
  } catch {
    return false
  }
}

/** 錠が書いてから `staleAfterMs` を過ぎているか。読めない（消えた）錠も取り直してよい側に倒す。 */
function isStaleLock(path: string, staleAfterMs: number, now: Temporal.Instant): boolean {
  try {
    return now.epochMilliseconds - statSync(path).mtimeMs > staleAfterMs
  } catch {
    return true
  }
}

function releasableLock(path: string): ChatConsolidationLock {
  return {
    release: () => {
      removeLockFile(path)
    },
  }
}

function removeLockFile(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // 消せなかった錠は、古さの閾値を過ぎたところで次の誰かが取り直す。
  }
}

/** `~/.tsukumo/chat-archive/<パック名>/recalled.jsonl` のパス。 */
function recalledPath(root: string, packName: string): string {
  return join(root, packName, RECALLED_FILE_NAME)
}

/** エピソード索引を読み、読める行だけを書いた順のまま返す（読めない行・知らない版は飛ばす）。 */
function readEpisodes(root: string, packName: string): readonly EpisodeLine[] {
  return readJsonLines(episodeIndexPath(root, packName)).flatMap((raw) => {
    const record = episodeLineSchema.safeParse(raw)
    return record.success ? [record.data] : []
  })
}

/** 思い出した記録から、`id` ごとに開いた回数を数える（読めない行・知らない版は数えない）。 */
function readRecalledCounts(root: string, packName: string): ReadonlyMap<string, number> {
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
 * 日付ごとの、次に振る通し番号の元になるカウンタ。
 * 既にある行の続きから振るので、1回の定着で複数のエピソードが同じ日に落ちても重ならない。
 */
function episodeIdCounters(existing: readonly EpisodeLine[]): Map<string, number> {
  const counters = new Map<string, number>()
  for (const record of existing) {
    const parsed = parseEpisodeId(record.id)
    if (parsed === undefined) {
      continue
    }
    counters.set(parsed.dateKey, Math.max(counters.get(parsed.dateKey) ?? 0, parsed.number))
  }
  return counters
}

const EPISODE_ID_PATTERN = /^(\d{4}-\d{2}-\d{2})-(\d+)$/

/** 既存の `id` を日付と通し番号に割る（形が合わない `id` は undefined）。 */
function parseEpisodeId(
  id: string,
): { readonly dateKey: string; readonly number: number } | undefined {
  const match = EPISODE_ID_PATTERN.exec(id)
  if (match === null) {
    return undefined
  }
  const dateKey = match[1]
  const numberText = match[2]
  if (dateKey === undefined || numberText === undefined) {
    return undefined
  }
  return { dateKey, number: Number(numberText) }
}

/** 候補を先頭から `limitBytes` に収まるところまで切る（溢れる1件は載せない）。 */
function trimCandidatesToBytes(
  candidates: readonly ChatEpisodeCandidate[],
  limitBytes: number,
): readonly ChatEpisodeCandidate[] {
  const trimmed: ChatEpisodeCandidate[] = []
  let usedBytes = 0
  for (const candidate of candidates) {
    const bytes = byteLength(candidate.title) + byteLength(candidate.gist)
    if (usedBytes + bytes > limitBytes) {
      break
    }
    trimmed.push(candidate)
    usedBytes += bytes
  }
  return trimmed
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
  const fromDate = from.slice(0, 10)
  const toDate = to.slice(0, 10)
  const fileNames = dateFileNames(dir).filter((name) => {
    const date = name.slice(0, 10)
    return date >= fromDate && date <= toDate
  })

  const entries: ChatArchiveRecentEntry[] = []
  let usedBytes = 0
  let overflowed = false
  for (const fileName of fileNames) {
    if (overflowed) {
      break
    }
    for (const raw of readJsonLines(join(dir, fileName))) {
      const timed = toTimedEntry(raw)
      if (timed === undefined || isBeforeAt(timed.at, from) || isAfterAt(timed.at, to)) {
        continue
      }
      const bytes = byteLength(timed.line.text)
      if (usedBytes + bytes > limitBytes) {
        overflowed = true
        break
      }
      entries.push(recentEntryOf(timed))
      usedBytes += bytes
    }
  }
  return { entries, overflowed }
}

/** `at` が `boundary` より後か（`Temporal.Instant` で比べる。オフセットが違っても正しく比べる）。 */
function isAfterAt(at: string, boundary: string): boolean {
  return Temporal.Instant.compare(Temporal.Instant.from(at), Temporal.Instant.from(boundary)) > 0
}

/** `at` が `boundary` より前か。 */
function isBeforeAt(at: string, boundary: string): boolean {
  return Temporal.Instant.compare(Temporal.Instant.from(at), Temporal.Instant.from(boundary)) < 0
}
