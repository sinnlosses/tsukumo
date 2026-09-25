// 雑談の会話のアーカイブ（`docs/design.md` 7章「雑談の会話のアーカイブはどこに置くか」）。
// ファイルに触るのはここだけ（原則3。1ファイル = 1つの境界）。置き場は
// `~/.tsukumo/chat-archive/<パック名>/<YYYY-MM-DD>.jsonl`、パックごと・日ごとで `cwd` には
// 依存させない。
//
// **何を残すか・いつ書くかの判断はここが決めない。** 判断は
// `src/server/session/core/session-manager.ts` の `receive` が持ち、ここが持つのは「どこに・どんな形で
// 書くか」——1件を1行の JSONL へ変換して追記するだけ（`docs/coding-standards.md`
// 「会話内容の扱い」とぶつからないための切り分け。`src/server/chat/adapter/chat-summary.ts` と同じ形）。
//
// 書けなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。
//
// **読む口は `readRecent` の1つだけ**（かつて決めた「読む口は持たない」を覆している。理由と
// 量の正典は `docs/chat-mode.md` 4.9「直近の会話は逐語のまま読み戻す」）。
// 読んだものの行き先は**雑談のセッションの `systemPrompt`** だけで、画面にも手続きの応答にも
// stderr にも出さない。**どこまで読むかは呼ぶ側が渡すバイト数**で、ここは遡って集めることと
// 並べ替えだけをする（文面を読んで載せる・載せないを決めない）。
//
// **古い雑談は、同じディレクトリの `index.jsonl`（日ごとの見出し。1日に何行でもある）を
// 引いてから、当たった日のファイルだけを開く**（`docs/chat-mode.md` 4.9
// 「古い雑談は索引を引いて思い出す」）。**同じ日の行はどれか1行にでも当たればその日を拾う。**
// **当たらない日のファイルは開かない**のがこの口の要点で、**引くのに外部コマンド（`grep`）を
// 起こさない** — 索引は日ごとに数行なので `node:fs` で読んで絞るだけで足りる。**見出しの文面を
// 決めるのはモデル**で、ここが持つのは置き場と形と上限だけ。
//
// **「残す」旗は、同じディレクトリの `kept.jsonl` に「時刻だけ」の索引として積む**
// （`docs/chat-mode.md` 4.9「残すと決めた1往復は窓から落とさない」）。**日付のファイルは
// 書き換えない**（追記のまま）し、**文面も複製しない** — ディスクの上に会話は1つだけで、
// `docs/coding-standards.md`「会話内容の扱い」の書き出しの例外表に数えずに済む。**どのやり取りに
// 立てるかの判断はここが決めない**（モデルが `keep` ツールを呼ぶかどうかだけ）。

import { rmSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import { isCharacterPackName } from "../../../shared/character.ts"
import { type Expression } from "../../../shared/expression.ts"
import { byteLength } from "../../../shared/lib/byte-length.ts"
import { appendJsonLine, dateFileNames, readJsonLines } from "../../adapter/lib/jsonl.ts"
import { isoWithOffset, localDateKey, todayLocalDateKey } from "../../adapter/local-time.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import {
  type ChatArchive,
  type ChatArchiveEntry,
  type ChatArchiveReadback,
  type ChatArchiveRecentEntry,
  type ChatEpisodeCandidate,
  type ChatEpisodeDraft,
  type ChatEpisodeReadResult,
  type ChatEpisodeRecallListResult,
  type ChatReadbackLimits,
  type ChatRecallResult,
  type ChatUnconsolidatedBatch,
  type ChatUnconsolidatedEntry,
  type ChatUnconsolidatedLimits,
} from "../../session-driver/core/session-driver.ts"
import { scoreChatEpisodes, type ChatEpisodeRecord } from "../core/chat-episode-score.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-archive/`）。 */
const CHAT_ARCHIVE_DIR_NAME = "chat-archive"

/** 行の形の版（`docs/design.md` 7章）。形を変えたら上げ、古い行と見分ける。 */
const ARCHIVE_FORMAT_VERSION = 1 satisfies number

/**
 * 「残す」旗の索引の名前（`docs/design.md` 7章）。**日付のファイルと同じディレクトリに置くが、
 * {@link dateFileNames} が拾う `YYYY-MM-DD.jsonl` の形を通らないので窓の側は読まない。**
 */
const KEPT_INDEX_FILE_NAME = "kept.jsonl"

/**
 * 日ごとの見出しの索引の名前（`docs/design.md` 7章）。**`kept.jsonl` と同じく
 * {@link dateFileNames} の形を通らない**ので、窓の走査には混ざらない。
 */
const DAY_INDEX_FILE_NAME = "index.jsonl"

/** 見出しの1行の長さの上限（超えた行は書かない。`remember` の1行と同じ値）。 */
const MAX_INDEX_LINE_LENGTH = 120

/**
 * エピソード索引の名前（`docs/design.md` 7章「エピソード索引はどこに置くか」）。
 * `KEPT_INDEX_FILE_NAME` / `DAY_INDEX_FILE_NAME` と同じく {@link dateFileNames} の形を
 * 通らないので、窓の走査には混ざらない。
 */
const EPISODE_INDEX_FILE_NAME = "episode.jsonl"

/** 思い出した記録の名前（`docs/design.md` 7章）。 */
const RECALLED_FILE_NAME = "recalled.jsonl"

/** エピソード索引の行の形の版（`docs/design.md` 7章。アーカイブの `1` とも `index.jsonl` の `1` とも見分ける）。 */
const EPISODE_FORMAT_VERSION = 2 satisfies number

/** 思い出した記録の行の形の版（`docs/design.md` 7章）。 */
const RECALLED_FORMAT_VERSION = 1 satisfies number

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

/**
 * 日ごとの見出しの1行。**照合に使うのは `date` と `line` の2つ**（`pack` は置き場所で既に
 * 決まっているので読まない）。
 */
const dayIndexLineSchema = z.object({
  v: z.literal(ARCHIVE_FORMAT_VERSION),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  line: z.string(),
})

/** エピソード索引の1行（`docs/design.md` 7章の表）。読めない行・知らない版は飛ばす。 */
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
 * `episode.jsonl` の1行の形。**`cues` は読むときも書くときも `readonly`**（zod の推論のままだと
 * 書くとき（{@link ChatEpisodeDraft.cues}）と読むときで可変・不変が食い違うため、手で定義する）。
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

/** 思い出した記録の1行（`docs/design.md` 7章）。文面は持たない。 */
const recalledLineSchema = z.object({
  v: z.literal(RECALLED_FORMAT_VERSION),
  id: z.string(),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
})

/**
 * 画面から作ったキャラクターパックと同じ親（`~/.tsukumo/chat-archive`）。書き込んでよいのは
 * この下だけ。
 */
export function chatArchiveDir(): string {
  return join(tsukumoHomeDir(), CHAT_ARCHIVE_DIR_NAME)
}

/**
 * パック1つぶんのアーカイブ（日ごとの会話・「残す」旗・日ごとの索引）をディレクトリごと消す
 * （**キャラクターパックを消したときだけ**呼ばれる。`docs/design.md` 7.1「消すときの細部」）。
 * 同じ名前で作り直したパックが、消したパックとの会話を読み戻したり思い出したりしないため。
 * 無い・消せないときも何もせず続ける。名前が {@link isCharacterPackName} を通らなければパスを
 * 組み立てない（書く口と同じ規則）。
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
 * アーカイブの読み書き口を作る（雑談モードのときだけ呼ばれる。`src/session-start.ts`）。
 * `root` は置き場の親（既定は {@link chatArchiveDir}）。差し替えられるのはテストがホームを
 * 汚さないためにある（`createChatSummary` の `root` と同じ手）。
 *
 * **1つの口を複数のパック・複数の日にまたいで使い回せる**——`append` のたびに `packName` と
 * `entry.at`（ローカル日付）から行き先のパスを組み立てる。パックの切り替え（`session.switchCharacter`）
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
  // そのターンで既に見出しを書いたか・既に索引を引いたか（**どちらも1ターンに1回**。
  // `remember` の1ターン1行と同じ縛りで、別々に数える）。
  let indexed = false
  let recalled = false

  return {
    append: (packName, entry) => {
      if (!isCharacterPackName(packName)) {
        return
      }
      const record = toArchiveRecord(packName, entry)
      appendJsonLine(join(root, packName, `${localDateKey(entry.at)}.jsonl`), record)
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
      indexed = false
      recalled = false
    },
    readRecent: (packName, limits) => readReadback(root, packName, limits),
    writeIndex: (packName, line) => {
      const trimmed = line.trim()
      if (indexed || !isCharacterPackName(packName) || !isWritableIndexLine(trimmed)) {
        return
      }
      indexed = true
      appendJsonLine(join(root, packName, DAY_INDEX_FILE_NAME), {
        v: ARCHIVE_FORMAT_VERSION,
        date: todayLocalDateKey(),
        pack: packName,
        line: trimmed,
      } satisfies DayIndexRecord)
    },
    recall: (packName, keyword, limitBytes) => {
      if (recalled) {
        return { kind: "already-recalled" }
      }
      if (!isCharacterPackName(packName)) {
        return { kind: "not-found" }
      }
      recalled = true
      return readRecalled(join(root, packName), keyword, limitBytes)
    },
    unconsolidated: (packName, limits) => readUnconsolidated(root, packName, limits),
    appendEpisodes: (packName, episodes) => writeEpisodes(root, packName, episodes),
    recallList: (packName, keyword, limitBytes, now) =>
      readEpisodeCandidates(root, packName, keyword, limitBytes, now),
    recallEpisode: (packName, id, limitBytes, now) =>
      readEpisode(root, packName, id, limitBytes, now),
  }
}

/**
 * 旗の立ったターンの行を、パックごとの索引へ1行ずつ書く。**書くのは版・時刻・パック名だけ**で、
 * **文面は複製しない**（`docs/coding-standards.md`「会話内容の扱い」の例外表を増やさないため。
 * 文面はアーカイブの日付のファイルに1つだけある）。
 */
function appendKeptMarks(root: string, marks: readonly KeptMark[]): void {
  for (const mark of marks) {
    appendJsonLine(join(root, mark.pack, KEPT_INDEX_FILE_NAME), {
      v: ARCHIVE_FORMAT_VERSION,
      at: mark.at,
      pack: mark.pack,
    } satisfies KeptRecord)
  }
}

/**
 * JSONL の1行の形（`docs/design.md` 7章の表）。**tsukumo の内部の型をそのまま書き出さない。**
 * `expression` / `images` は「無いかもしれない」プロパティなので `T | undefined` で持つ（`?:`
 * は使わない。`docs/coding-standards.md`「「無いかもしれない」値」）——どちらを持つかは `speaker`
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

/**
 * 日ごとの見出しの1行の形（`docs/design.md` 7章）。**`line` を書くのはモデル**で、tsukumo が
 * 足すのは版・日付・パック名だけ。
 */
type DayIndexRecord = {
  readonly v: typeof ARCHIVE_FORMAT_VERSION
  readonly date: string
  readonly pack: string
  readonly line: string
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
function toArchiveRecord(packName: string, entry: ChatArchiveEntry): ArchiveRecord {
  const base = {
    v: ARCHIVE_FORMAT_VERSION,
    at: isoWithOffset(entry.at),
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
 * **溢れる1件は載せない**（`docs/chat-mode.md` 4.9「切り方」）。1件だけで `limitBytes` を
 * 超える行が先頭に来たときは空を返す——行の途中で切るくらいなら逐語なしで始める。
 */
function readRecentEntries(dir: string, limitBytes: number): readonly TimedEntry[] {
  return readEntriesBackward(dir, newestFirstFileNames(dir), limitBytes)
}

/**
 * 渡された順のファイルを、**各ファイルは末尾の行から遡って**集める（返すのは古い→新しいの順）。
 * 文面のバイト数の合計が `limitBytes` に届いたところで**それ以上は読まない**（**残りの
 * ファイルは開かない**）。
 *
 * **窓（新しい日から全部）と `recall`（索引に当たった日だけ）で同じ1つの走査を使う** — 違うのは
 * 渡すファイルの並びだけで、切り方（1件を単位にし、溢れる1件は載せない）は1箇所にある。
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
    for (const raw of [...readJsonLines(join(dir, `${date}.jsonl`))].reverse()) {
      const timed = toTimedEntry(raw)
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
  const marks = readJsonLines(path).flatMap((raw) => {
    const record = keptLineSchema.safeParse(raw)
    return record.success ? [record.data.at] : []
  })
  return new Set(marks)
}

/**
 * 索引を引き、当たった日のファイルだけを新しい順に開く（{@link ChatArchive.recall} の実装）。
 *
 * **索引に当たる日が1つも無ければ、日のファイルは1つも開かない**（`not-found` を返す。
 * `docs/chat-mode.md` 4.9「古い雑談は索引を引いて思い出す」）。当たった日を全部読んでも
 * 1件も残らなかったとき（指す先が消えている・全部壊れている）も `not-found` にする——
 * 呼ぶ側に「空の found」を持たせない。
 */
function readRecalled(dir: string, keyword: string, limitBytes: number): ChatRecallResult {
  const dates = matchedIndexDates(dir, keyword)
  if (dates.length === 0) {
    return { kind: "not-found" }
  }

  const entries = readEntriesBackward(
    dir,
    dates.map((date) => `${date}.jsonl`),
    limitBytes,
  ).map((timed) => timed.entry)
  return entries.length === 0 ? { kind: "not-found" } : { kind: "found", entries }
}

/**
 * `keyword` に当たった日を新しい順に並べる（索引が無い・当たらないときは空。返る日付に
 * 重複は無い）。
 *
 * **照合は小文字にしての部分一致**で、空白で分けた語は**どれか1つでも当たれば**その日を拾う
 * （言葉のずれを吸収するのが索引の役。足りないより多いほうへ倒す）。**同じ日の行は全部照合の
 * 対象にする**——1日に何行書かれていても、**どれか1行にでも当たればその日**を拾う。**日付
 * そのものも照合の対象**なので、日付の文字列をそのまま鍵にしても引ける。
 */
function matchedIndexDates(dir: string, keyword: string): readonly string[] {
  const terms = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "")
  if (terms.length === 0) {
    return []
  }

  const headings = readDayIndexHeadings(join(dir, DAY_INDEX_FILE_NAME))
  const matched = [...headings]
    .filter(([date, lines]) =>
      lines.some((line) => terms.some((term) => `${date} ${line}`.toLowerCase().includes(term))),
    )
    .map(([date]) => date)
  return matched.sort().reverse()
}

/**
 * 索引の日付と、その日に積まれた見出しの全部（読めない行・知らない版は落とす。索引が無いときは
 * 空）。**1日に何行あっても全部持つ**——`chat-manner.ts` の指示どおり区切りごとに書かれるので、
 * 古い行の語だけに当たった検索が抜け落ちないようにする（`docs/design.md` 7章）。
 */
function readDayIndexHeadings(path: string): ReadonlyMap<string, readonly string[]> {
  const headings = new Map<string, readonly string[]>()
  for (const raw of readJsonLines(path)) {
    const record = dayIndexLineSchema.safeParse(raw)
    if (record.success) {
      const lines = headings.get(record.data.date) ?? []
      headings.set(record.data.date, [...lines, record.data.line])
    }
  }
  return headings
}

/** 索引に書いてよい見出しか（空・改行つき・長すぎる行は書かない）。 */
function isWritableIndexLine(line: string): boolean {
  return line !== "" && !line.includes("\n") && line.length <= MAX_INDEX_LINE_LENGTH
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
  return [...dateFileNames(dir)].reverse()
}

/**
 * JSONL の1行を、載せる形（話者の別・文面・日付）へ畳む。**壊れた JSON・知らない版・鍵が
 * 足りない行は undefined**（1行ずつ落とす。JSONL は壊れても被害が1行）。
 *
 * **`expression` と `images` はここで読まない**（口が最初から渡さない。
 * `docs/chat-mode.md` 4.9）。日付は `at` の頭10文字で、**行だけで意味が決まる**
 * （ファイル名には頼らない）。
 */
function toTimedEntry(raw: unknown): TimedEntry | undefined {
  const record = archiveLineSchema.safeParse(raw)
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

/**
 * まだどのエピソードにも入っていない行を読む（{@link ChatArchive.unconsolidated} の実装）。
 * **最後のエピソードの `to` より後**（エピソードが無ければアーカイブの最初から）で、**直近の窓
 * （{@link readRecentEntries} が拾う範囲）の外**にある行だけを、古いほうから `maxBytes` まで
 * 集める。
 */
function readUnconsolidated(
  root: string,
  packName: string,
  limits: ChatUnconsolidatedLimits,
): ChatUnconsolidatedBatch {
  if (!isCharacterPackName(packName)) {
    return { entries: [], usedBytes: 0 }
  }

  const dir = join(root, packName)
  const afterAt = readEpisodes(root, packName).at(-1)?.to
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
  for (const timed of all) {
    if (afterAt !== undefined && !isAfterAt(timed.at, afterAt)) {
      continue
    }
    if (windowStartAt !== undefined && !isBeforeAt(timed.at, windowStartAt)) {
      break
    }
    const bytes = byteLength(timed.entry.text)
    if (usedBytes + bytes > limits.maxBytes) {
      break
    }
    entries.push({ at: timed.at, speaker: timed.entry.speaker, text: timed.entry.text })
    usedBytes += bytes
  }
  return { entries, usedBytes }
}

/**
 * 定着ができたエピソードを追記する（{@link ChatArchive.appendEpisodes} の実装）。`id` は
 * `to` のローカル日付＋その日の通し番号（`-1` から）で振る。
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
 * 採点は `chat/core/chat-episode-score.ts` の純関数で、ここは行を読んで渡し、
 * `recallListBytes` に収まるところで切るだけ。
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
 * 1件のエピソードの範囲を逐語のまま読む（{@link ChatArchive.recallEpisode} の実装）。**開いたら
 * `recalled.jsonl` に記録する**——文面は複製せず、`v`・`id`・時刻だけを追記する
 * （`docs/coding-standards.md`「会話内容の扱い」の例外表を増やさないため）。
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
 * 日付ごとの、次に振る通し番号の元になるカウンタ（**既にある行の続きから振る**——1回の定着で
 * 複数のエピソードが同じ日に落ちても重ならない）。
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
 * `from`〜`to`（両端含む）の逐語を古いほうから `limitBytes` まで読む。**当たる日のファイルだけ
 * 開く**——アーカイブが何年ぶん増えても開くファイルの数は範囲の日数で頭打ちになる。
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
      const bytes = byteLength(timed.entry.text)
      if (usedBytes + bytes > limitBytes) {
        overflowed = true
        break
      }
      entries.push(timed.entry)
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
