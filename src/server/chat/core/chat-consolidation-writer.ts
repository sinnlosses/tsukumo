// 定着を1回走らせて書く口。
// 未定着の行を数え、契機に届いていれば使い捨ての `query()` に畳ませ、検査を通ったものをエピソード → あらすじの順で書く。
// どこまで畳んだかはエピソードが決め、あらすじは取り込んだ最後の行の時刻を印に持つ。
// 印がエピソードの終わりより前なら（エピソードを書いたあと、あらすじを書く前に落ちた続き）、その間の行からあらすじだけを書き直す。
// ここは1回ぶんだけを持つ。
// プロセスをまたいで1本に絞るのは定着の錠で、プロセスの中で1本に絞るのは呼び出し側。
//
// 書く口は決して reject しない（起こせない・中断・時間切れ・形の崩れ・写しの書き込み失敗はどれも理由つきの `failed`）。
// 行は未定着のまま残り、次の契機で拾い直される。
//
// 渡す行も前のあらすじも受け取る出力も会話の内容に当たる。
// メモリにだけ持ち、書くのは索引とあらすじのファイルだけで、ログには出さない。
// 書いてよい範囲と定着の `query()` へ渡してよい範囲は `docs/coding-standards.md`「会話内容の扱い」の例外の表が決めている。

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import type {
  ChatFoldPoint,
  ChatSummary,
  ChatSummaryFold,
} from "../../session-driver/core/session-driver.ts"
import type {
  ChatArchive,
  ChatUnconsolidatedBatch,
  ChatUnconsolidatedLimits,
} from "./chat-archive-port.ts"
import {
  CHAT_CONSOLIDATION_LIMITS,
  CHAT_CONSOLIDATION_TIMEOUT_MS,
  type ChatConsolidationRejection,
  type ChatConsolidationResult,
  chatConsolidationQuery,
  chatEpisodeDrafts,
  type ChatConsolidationQuery,
  chatSynopsisShrunk,
  parseChatConsolidationResult,
  readChatTopics,
} from "./chat-consolidation.ts"
import { isBeforeAt } from "./chat-instant-order.ts"

/**
 * 1回ぶんの結果。
 *
 * - `not-due`: 未定着の行が契機（`consolidateEveryBytes`）に届いていないので起こさなかった
 * - `locked`: ほかのプロセスが錠を持っているので起こさなかった（その契機は捨てる）
 * - `written`: 書けた。`topics` は書いたあとのファイルから読み直した最近の話題の見出し、`droppedLines` は上限に収めるために落としたあらすじの行数、
 *   `shrinkWaived` は縮みの検査に落ちる続きが {@link CHAT_CONSOLIDATION_LIMITS.synopsisShrinkWaiveAt} 回目に届き、縮んだまま書いたこと
 * - `failed`: 書けなかった。次の契機で拾い直す。`reason` で見分ける
 *   - `aborted`: 中断・時間切れ
 *   - `unreadable-result`: 結果が検査を通らない。`rejection` が落ちた理由（`synopsis-shrunk` は前のあらすじから縮みすぎ）
 *   - `summary-write`: あらすじの写しが書けなかった
 *   - `episode-write`: エピソードの索引が書けなかった（あらすじも書かない）
 *   - `query-result`: `query()` の result が成功でなかった。`resultKind` が SDK の `subtype`
 *   - `threw`: 上以外の例外（起こせない・API の失敗など）。`error` は受け取った側が `error.name` と code だけを写す
 */
export type ChatConsolidationOutcome =
  | { readonly kind: "not-due" }
  | { readonly kind: "locked" }
  | {
      readonly kind: "written"
      readonly topics: readonly string[]
      readonly droppedLines: number
      readonly shrinkWaived: boolean
    }
  | { readonly kind: "failed"; readonly reason: "aborted" | "summary-write" | "episode-write" }
  | {
      readonly kind: "failed"
      readonly reason: "unreadable-result"
      readonly rejection: ChatConsolidationRejection | "synopsis-shrunk"
    }
  | {
      readonly kind: "failed"
      readonly reason: "query-result"
      readonly resultKind: ChatConsolidationResultKind
    }
  | { readonly kind: "failed"; readonly reason: "threw"; readonly error: unknown }

const CHAT_CONSOLIDATION_RESULT_KINDS = [
  "error_during_execution",
  "error_max_turns",
  "error_max_budget_usd",
  "error_max_structured_output_retries",
  "other",
] as const

/** SDK の result が成功でなかったときの `subtype`（知らない語は `other`）。 */
export type ChatConsolidationResultKind = (typeof CHAT_CONSOLIDATION_RESULT_KINDS)[number]

/** `query()` の result が成功でなかったときに口が投げる。`subtype` は SDK の語のまま持つ。 */
export class ChatConsolidationResultError extends Error {
  readonly subtype: string

  constructor(subtype: string) {
    super("定着の result が成功でなかった")
    this.name = "ChatConsolidationResultError"
    this.subtype = subtype
  }
}

/** そのパックの定着を1回走らせる。`signal` が中断されたら、待たずに `failed` で返り、何も書かない。 */
export type ChatConsolidationWriter = (
  packName: CharacterPackName,
  signal: AbortSignal,
) => Promise<ChatConsolidationOutcome>

/**
 * 定着の出どころ。
 *
 * - `dont-consolidate`: 走らせない（疑似セッション。claude を起こさない）
 * - `consolidate`: 雑談・仕事のターンの終わりに走らせる
 */
export type ChatConsolidationSource =
  | { readonly kind: "dont-consolidate" }
  | { readonly kind: "consolidate"; readonly consolidate: ChatConsolidationWriter }

/** {@link ChatConsolidationWriterPorts.lockConsolidation} が取れたときの錠。 */
export type ChatConsolidationLock = {
  /** 錠を外す。外せなくても例外は投げない。 */
  readonly release: () => void
}

/** 書く口に外の世界から渡すもの（配線が渡す）。 */
export type ChatConsolidationWriterPorts = {
  /** 定着の入力の行の取り出しとエピソードの追記。 */
  readonly archive: Pick<ChatArchive, "unconsolidated" | "appendEpisodes">
  /**
   * そのパックの定着の錠を取る。プロセスをまたいで1本だけが取れる。
   * 取れなければ undefined（ほかの誰かが走らせている）。
   * 書いてから `staleAfterMs` を過ぎた錠は、落ちたプロセスの残りとして消して取り直す。
   */
  readonly lockConsolidation: (
    packName: CharacterPackName,
    staleAfterMs: number,
    now: Temporal.Instant,
  ) => ChatConsolidationLock | undefined
  /** パック1つぶんのあらすじの読み書き口（書くのは起こした時点のパックのファイル）。 */
  readonly chatSummary: (packName: CharacterPackName) => ChatSummary
  /** 使い捨ての `query()`。返すのは `structured_output` のまま（検査はここでする）。 */
  readonly query: (request: ChatConsolidationQuery, signal: AbortSignal) => Promise<unknown>
  /** いまの時刻（エポックミリ秒）。錠の古さを測るのに使う。 */
  readonly now: () => number
}

const ABORTED = { kind: "failed", reason: "aborted" } as const satisfies ChatConsolidationOutcome
const NOT_DUE = { kind: "not-due" } as const satisfies ChatConsolidationOutcome
const LOCKED = { kind: "locked" } as const satisfies ChatConsolidationOutcome

/** 書いてからこれを過ぎた錠は、落ちたプロセスの残りとして取り直す。 */
const CHAT_CONSOLIDATION_LOCK_STALE_MS = CHAT_CONSOLIDATION_TIMEOUT_MS * 2

/**
 * パックごとの、前に書けてから縮みの検査で落ちた回数。
 * プロセスのメモリにだけ持つ（起こし直すと 0 から数え直す）。
 */
type ShrinkTally = {
  readonly read: (packName: CharacterPackName) => number
  readonly put: (packName: CharacterPackName, count: number) => void
}

export function createChatConsolidationWriter(
  ports: ChatConsolidationWriterPorts,
): ChatConsolidationWriter {
  const counts = new Map<string, number>()
  const shrinkTally: ShrinkTally = {
    read: (packName) => counts.get(packName) ?? 0,
    put: (packName, count) => {
      counts.set(packName, count)
    },
  }
  return (packName, signal) => {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(CHAT_CONSOLIDATION_TIMEOUT_MS)])
    return Promise.race([consolidate(ports, shrinkTally, packName, bounded), abortion(bounded)])
  }
}

async function consolidate(
  ports: ChatConsolidationWriterPorts,
  shrinkTally: ShrinkTally,
  packName: CharacterPackName,
  signal: AbortSignal,
): Promise<ChatConsolidationOutcome> {
  const lock = ports.lockConsolidation(
    packName,
    CHAT_CONSOLIDATION_LOCK_STALE_MS,
    Temporal.Instant.fromEpochMilliseconds(ports.now()),
  )
  if (lock === undefined) {
    return LOCKED
  }
  try {
    return await consolidateLocked(ports, shrinkTally, packName, signal)
  } finally {
    lock.release()
  }
}

async function consolidateLocked(
  ports: ChatConsolidationWriterPorts,
  shrinkTally: ShrinkTally,
  packName: CharacterPackName,
  signal: AbortSignal,
): Promise<ChatConsolidationOutcome> {
  try {
    const chatSummary = ports.chatSummary(packName)
    const batch = ports.archive.unconsolidated(packName, BATCH_LIMITS, { kind: "after-episodes" })
    const fold = chatSummary.readFold()
    const alignment = summaryAlignment(fold, batch.episodesThrough)
    if (alignment.kind === "behind") {
      return await resummarize(ports, shrinkTally, packName, chatSummary, alignment, signal)
    }

    // maxBytes に届いて打ち切ったとき（先頭の1件だけで超えるときを含む）は、契機に届いていなくてもここまでを渡す。
    // 待つと、残りの行がずっと畳まれなくなる。
    const lastEntry = batch.entries.at(-1)
    if (
      lastEntry === undefined ||
      (!batch.overflowed && batch.usedBytes < CHAT_MEMORY_BUDGET.consolidateEveryBytes)
    ) {
      return NOT_DUE
    }

    const folded = await foldBatch(ports, shrinkTally, packName, chatSummary, batch, signal)
    if (folded.kind === "failed") {
      return folded
    }
    const { result } = folded

    // 印を持たない写しは、追記の前にいまのエピソードの終わりを印にする（追記のあとで落ちても、次の回が食い違いに気づける）。
    if (fold.kind === "unknown" && chatSummary.writeFold(batch.episodesThrough).kind === "failed") {
      return { kind: "failed", reason: "summary-write" }
    }
    const appended = ports.archive.appendEpisodes(
      packName,
      chatEpisodeDrafts(batch.entries, result.episodes),
    )
    if (appended.kind === "failed") {
      return { kind: "failed", reason: "episode-write" }
    }
    return writeSynopsis(shrinkTally, packName, chatSummary, folded, lastEntry.at)
  } catch (error) {
    if (signal.aborted) {
      return ABORTED
    }
    if (error instanceof ChatConsolidationResultError) {
      return { kind: "failed", reason: "query-result", resultKind: resultKindOf(error) }
    }
    return { kind: "failed", reason: "threw", error }
  }
}

/** 1回に畳むのは契機の2倍まで。溜まった量もこの読みで分かる。 */
const BATCH_LIMITS = {
  recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes,
  maxBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes * 2,
} as const satisfies ChatUnconsolidatedLimits

/**
 * あらすじとエピソードの食い違い。
 * `behind` はあらすじが `after` で止まり、エピソードが `through` まで進んでいる（追記のあと、あらすじを書く前に落ちた続き）。
 */
type SummaryAlignment =
  | { readonly kind: "aligned" }
  | { readonly kind: "behind"; readonly after: ChatFoldPoint; readonly through: string }

/** 印が分からない写しは、エピソードと揃っているとみなす（消された写しの前の話を畳み直さない）。 */
function summaryAlignment(fold: ChatSummaryFold, episodesThrough: ChatFoldPoint): SummaryAlignment {
  if (fold.kind === "unknown" || episodesThrough.kind === "none") {
    return { kind: "aligned" }
  }
  if (fold.kind === "none" || isBeforeAt(fold.at, episodesThrough.at)) {
    return { kind: "behind", after: fold, through: episodesThrough.at }
  }
  return { kind: "aligned" }
}

/**
 * エピソードには入ったがあらすじに入っていない行から、あらすじと話題だけを書き直す。
 * 索引には足さない（返ってきたエピソードは捨てる）。
 */
async function resummarize(
  ports: ChatConsolidationWriterPorts,
  shrinkTally: ShrinkTally,
  packName: CharacterPackName,
  chatSummary: ChatSummary,
  behind: Extract<SummaryAlignment, { kind: "behind" }>,
  signal: AbortSignal,
): Promise<ChatConsolidationOutcome> {
  const batch = ports.archive.unconsolidated(packName, BATCH_LIMITS, {
    kind: "between",
    after: behind.after,
    through: behind.through,
  })
  const lastEntry = batch.entries.at(-1)
  // 読み直せる行が無い（アーカイブから消えた）ときは、印だけをエピソードの終わりへ進める。
  if (lastEntry === undefined) {
    return chatSummary.writeFold({ kind: "through", at: behind.through }).kind === "written"
      ? {
          kind: "written",
          topics: readChatTopics(chatSummary),
          droppedLines: 0,
          shrinkWaived: false,
        }
      : { kind: "failed", reason: "summary-write" }
  }
  const folded = await foldBatch(ports, shrinkTally, packName, chatSummary, batch, signal)
  if (folded.kind === "failed") {
    return folded
  }
  return writeSynopsis(shrinkTally, packName, chatSummary, folded, lastEntry.at)
}

type FoldedBatch = {
  readonly kind: "folded"
  readonly result: ChatConsolidationResult
  readonly shrunk: boolean
}

/** 行を `query()` に畳ませ、検査と縮みの検査を通す。 */
async function foldBatch(
  ports: ChatConsolidationWriterPorts,
  shrinkTally: ShrinkTally,
  packName: CharacterPackName,
  chatSummary: ChatSummary,
  batch: ChatUnconsolidatedBatch,
  signal: AbortSignal,
): Promise<FoldedBatch | Extract<ChatConsolidationOutcome, { kind: "failed" }>> {
  const previousSynopsis = chatSummary.read()?.summary ?? ""
  const request = chatConsolidationQuery({
    entries: batch.entries,
    previousSynopsis,
    previousEpisodeTitle: batch.previousEpisodeTitle,
  })
  const check = parseChatConsolidationResult(
    await ports.query(request, signal),
    batch.entries.length,
  )
  // 中断・時間切れのあとに届いた結果は書かない（呼び出し側はもう次の1本を起こしうる）。
  if (signal.aborted) {
    return ABORTED
  }
  if (check.kind === "rejected") {
    return { kind: "failed", reason: "unreadable-result", rejection: check.rejection }
  }
  const { result } = check
  const shrunk = chatSynopsisShrunk(result.synopsis, previousSynopsis)
  if (shrunk) {
    const rejected = shrinkTally.read(packName) + 1
    if (rejected < CHAT_CONSOLIDATION_LIMITS.synopsisShrinkWaiveAt) {
      shrinkTally.put(packName, rejected)
      return { kind: "failed", reason: "unreadable-result", rejection: "synopsis-shrunk" }
    }
  }
  return { kind: "folded", result, shrunk }
}

/** あらすじと話題を、取り込んだ最後の行の時刻と一緒に書く。 */
function writeSynopsis(
  shrinkTally: ShrinkTally,
  packName: CharacterPackName,
  chatSummary: ChatSummary,
  folded: FoldedBatch,
  foldedThrough: string,
): ChatConsolidationOutcome {
  const written = chatSummary.write(folded.result.synopsis, folded.result.topics, foldedThrough)
  if (written.kind === "failed") {
    return { kind: "failed", reason: "summary-write" }
  }
  shrinkTally.put(packName, 0)
  return {
    kind: "written",
    topics: readChatTopics(chatSummary),
    droppedLines: written.droppedLines,
    shrinkWaived: folded.shrunk,
  }
}

function resultKindOf(error: ChatConsolidationResultError): ChatConsolidationResultKind {
  return CHAT_CONSOLIDATION_RESULT_KINDS.find((kind) => kind === error.subtype) ?? "other"
}

/** `signal` が中断されたら `aborted` の `failed` で返る（口が中断を無視しても待たない）。 */
function abortion(signal: AbortSignal): Promise<ChatConsolidationOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(ABORTED)
      return
    }
    signal.addEventListener(
      "abort",
      () => {
        resolve(ABORTED)
      },
      { once: true },
    )
  })
}
