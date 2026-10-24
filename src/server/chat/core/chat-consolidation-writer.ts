// 定着を1回走らせて書く口。
// 未定着の行を数え、契機に届いていれば使い捨ての `query()` に畳ませ、検査を通ったあらすじと話題を書く。
// どこまで畳んだかはあらすじの写しの印（取り込んだ最後の行の時刻）が決め、次の回はその後の行から読む。
// ここは1回ぶんだけを持つ。
// プロセスをまたいで1本に絞るのは定着の錠で、プロセスの中で1本に絞るのは呼び出し側。
//
// 書く口は決して reject しない（起こせない・中断・時間切れ・形の崩れ・写しの書き込み失敗はどれも理由つきの `failed`）。
// 行は未定着のまま残り、次の契機で拾い直される。
//
// 渡す行も前のあらすじも受け取る出力も会話の内容に当たる。
// メモリにだけ持ち、書くのはあらすじのファイルだけで、ログには出さない。
// 書いてよい範囲と定着の `query()` へ渡してよい範囲は `docs/coding-standards.md`「会話内容の扱い」の例外の表が決めている。

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import {
  runWithDeadline,
  type StructuredQuery,
  StructuredQueryResultError,
} from "../../core/structured-query.ts"
import {
  createQueryBackoff,
  type QueryBackoffEffect,
  type QueryBackoffPolicy,
  type QueryLockPort,
} from "../../core/throwaway-query.ts"
import type {
  ChatArchive,
  ChatUnconsolidatedEntry,
  ChatUnconsolidatedLimits,
} from "./chat-archive-port.ts"
import {
  CHAT_CONSOLIDATION_LIMITS,
  CHAT_CONSOLIDATION_TIMEOUT_MS,
  type ChatConsolidationRejection,
  type ChatConsolidationResult,
  chatConsolidationQuery,
  chatSynopsisShrunk,
  parseChatConsolidationResult,
  readChatTopics,
} from "./chat-consolidation.ts"
import type { ChatFoldPoint, ChatSummary, ChatSummaryFold } from "./chat-memory.ts"

/**
 * 1回ぶんの結果。
 *
 * - `not-due`: 未定着の行が契機（`consolidateEveryBytes`）に届いていないので起こさなかった
 * - `locked`: ほかのプロセスが錠を持っているので起こさなかった（その契機は捨てる）
 * - `backed-off`: 続けて落ちたので、この契機は錠も取らず行も読まずに飛ばした（`CHAT_CONSOLIDATION_BACKOFF`）
 * - `written`: 書けた。`topics` は書いたあとのファイルから読み直した最近の話題の見出し、`droppedLines` は上限に収めるために落としたあらすじの行数、
 *   `shrinkWaived` は縮みの検査に落ちる続きが {@link CHAT_CONSOLIDATION_LIMITS.synopsisShrinkWaiveAt} 回目に届き、縮んだまま書いたこと
 * - `failed`: 書けなかった。次の契機で拾い直す。`reason` で見分ける
 *   - `aborted`: 中断・時間切れ
 *   - `unreadable-result`: 結果が検査を通らない。`rejection` が落ちた理由（`synopsis-shrunk` は前のあらすじから縮みすぎ）
 *   - `summary-write`: あらすじの写しが書けなかった
 *   - `query-result`: `query()` の result が成功でなかった。`resultKind` が SDK の `subtype`
 *   - `threw`: 上以外の例外（起こせない・API の失敗など）。`error` は受け取った側が `error.name` と code だけを写す
 */
export type ChatConsolidationOutcome =
  | { readonly kind: "not-due" }
  | { readonly kind: "locked" }
  | { readonly kind: "backed-off" }
  | {
      readonly kind: "written"
      readonly topics: readonly string[]
      readonly droppedLines: number
      readonly shrinkWaived: boolean
    }
  | { readonly kind: "failed"; readonly reason: "aborted" | "summary-write" }
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

/** 書く口に外の世界から渡すもの（配線が渡す）。 */
export type ChatConsolidationWriterPorts = {
  /** 定着の入力の行の取り出し。 */
  readonly archive: Pick<ChatArchive, "unconsolidated" | "appendedBytes">
  /** そのパックの定着の錠を取る（鍵はパック名）。 */
  readonly lockConsolidation: QueryLockPort<CharacterPackName>
  /** パック1つぶんのあらすじの読み書き口（書くのは起こした時点のパックのファイル）。 */
  readonly chatSummary: (packName: CharacterPackName) => ChatSummary
  /** 使い捨ての `query()`。返すのは `structured_output` のまま（検査はここでする）。 */
  readonly query: (request: StructuredQuery, signal: AbortSignal) => Promise<unknown>
  /** いまの時刻（エポックミリ秒）。錠の古さを測るのに使う。 */
  readonly now: () => number
}

const ABORTED = { kind: "failed", reason: "aborted" } as const satisfies ChatConsolidationOutcome
const NOT_DUE = { kind: "not-due" } as const satisfies ChatConsolidationOutcome
const LOCKED = { kind: "locked" } as const satisfies ChatConsolidationOutcome
const BACKED_OFF = { kind: "backed-off" } as const satisfies ChatConsolidationOutcome

/** 書いてからこれを過ぎた錠は、落ちたプロセスの残りとして取り直す。 */
const CHAT_CONSOLIDATION_LOCK_STALE_MS = CHAT_CONSOLIDATION_TIMEOUT_MS * 2

/**
 * 続けて落ちたパックの定着の契機を間引く数。勘定はパックごとに、プロセスのメモリにだけ持つ。
 * 錠はプロセスをまたぐが、この勘定はプロセスごとに別。
 */
export const CHAT_CONSOLIDATION_BACKOFF = {
  failuresBeforeBackoff: 3,
  maxSkips: 32,
} as const satisfies QueryBackoffPolicy

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
  const backoff = createQueryBackoff<CharacterPackName>(CHAT_CONSOLIDATION_BACKOFF)
  const dueGate = createDueGate(ports.archive)
  return async (packName, signal) => {
    if (backoff.holdsBack(packName)) {
      return BACKED_OFF
    }
    if (dueGate.isTooEarly(packName)) {
      return NOT_DUE
    }
    const outcome = await runWithDeadline<ChatConsolidationOutcome>(
      signal,
      CHAT_CONSOLIDATION_TIMEOUT_MS,
      (bounded) => consolidate(ports, shrinkTally, dueGate, packName, bounded),
      ABORTED,
    )
    if (outcome.kind !== "not-due" && outcome.kind !== "locked") {
      dueGate.reset(packName)
    }
    backoff.note(packName, chatConsolidationBackoffEffect(outcome))
    return outcome
  }
}

/** 数えるのは同じ入力で落ち続けうる失敗だけ（`docs/architecture/chat-mode/consolidation-failure.md`「続けて落ちたら契機を間引く」）。 */
export function chatConsolidationBackoffEffect(
  outcome: ChatConsolidationOutcome,
): QueryBackoffEffect {
  switch (outcome.kind) {
    case "written":
    case "not-due":
      return "reset"
    case "locked":
    case "backed-off":
      return "keep"
    case "failed":
      switch (outcome.reason) {
        case "threw":
        case "query-result":
          return "count"
        case "unreadable-result":
          return outcome.rejection === "synopsis-shrunk" ? "keep" : "count"
        case "aborted":
        case "summary-write":
          return "keep"
      }
  }
}

/**
 * 契機に届くまで `unconsolidated` を読まないための控え（プロセスのメモリ）。
 * 前に読んで契機に届かなかったときの未定着のバイト数に、その後このプロセスが追記したバイト数を足した値が契機に届くまで、読まずに not-due にする。
 * 起こしてから最初の1回と、契機に届いて走らせたあとは控えが無いので読む（前のプロセスの書き残しや、続きの未定着を拾う）。
 */
type DueGate = {
  readonly isTooEarly: (packName: CharacterPackName) => boolean
  readonly defer: (packName: CharacterPackName, unconsolidatedBytes: number) => void
  readonly reset: (packName: CharacterPackName) => void
}

function createDueGate(archive: Pick<ChatArchive, "appendedBytes">): DueGate {
  const deferred = new Map<string, { readonly appendedAt: number; readonly bytes: number }>()
  return {
    isTooEarly: (packName) => {
      const at = deferred.get(packName)
      return (
        at !== undefined &&
        at.bytes + archive.appendedBytes(packName) - at.appendedAt <
          CHAT_MEMORY_BUDGET.consolidateEveryBytes
      )
    },
    defer: (packName, unconsolidatedBytes) => {
      deferred.set(packName, {
        appendedAt: archive.appendedBytes(packName),
        bytes: unconsolidatedBytes,
      })
    },
    reset: (packName) => {
      deferred.delete(packName)
    },
  }
}

async function consolidate(
  ports: ChatConsolidationWriterPorts,
  shrinkTally: ShrinkTally,
  dueGate: DueGate,
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
    return await consolidateLocked(ports, shrinkTally, dueGate, packName, signal)
  } finally {
    lock.release()
  }
}

async function consolidateLocked(
  ports: ChatConsolidationWriterPorts,
  shrinkTally: ShrinkTally,
  dueGate: DueGate,
  packName: CharacterPackName,
  signal: AbortSignal,
): Promise<ChatConsolidationOutcome> {
  try {
    const chatSummary = ports.chatSummary(packName)
    const batch = ports.archive.unconsolidated(
      packName,
      BATCH_LIMITS,
      foldPointOf(chatSummary.readFold()),
    )

    // maxBytes に届いて打ち切ったとき（先頭の1件だけで超えるときを含む）は、契機に届いていなくてもここまでを渡す。
    // 待つと、残りの行がずっと畳まれなくなる。
    const lastEntry = batch.entries.at(-1)
    if (
      lastEntry === undefined ||
      (!batch.overflowed && batch.usedBytes < CHAT_MEMORY_BUDGET.consolidateEveryBytes)
    ) {
      dueGate.defer(packName, batch.usedBytes)
      return NOT_DUE
    }

    const folded = await foldBatch(ports, shrinkTally, packName, chatSummary, batch.entries, signal)
    if (folded.kind === "failed") {
      return folded
    }
    return writeSynopsis(shrinkTally, packName, chatSummary, folded, lastEntry.at)
  } catch (error) {
    if (signal.aborted) {
      return ABORTED
    }
    if (error instanceof StructuredQueryResultError) {
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

/** 印を持たない写しは、まだ1行も畳んでいないものとしてアーカイブの最初から読む。 */
function foldPointOf(fold: ChatSummaryFold): ChatFoldPoint {
  return fold.kind === "unknown" ? { kind: "none" } : fold
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
  entries: readonly ChatUnconsolidatedEntry[],
  signal: AbortSignal,
): Promise<FoldedBatch | Extract<ChatConsolidationOutcome, { kind: "failed" }>> {
  const previousSynopsis = chatSummary.read()?.summary ?? ""
  const request = chatConsolidationQuery({ entries, previousSynopsis })
  const check = parseChatConsolidationResult(await ports.query(request, signal))
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

function resultKindOf(error: StructuredQueryResultError): ChatConsolidationResultKind {
  return CHAT_CONSOLIDATION_RESULT_KINDS.find((kind) => kind === error.subtype) ?? "other"
}
