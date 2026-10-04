// 定着を1回走らせて書く口。
// 未定着の行を数え、契機に届いていれば使い捨ての `query()` に畳ませ、検査を通ったものをエピソード → あらすじの順で書く。
// ここは1回ぶんだけを持つ。
// プロセスをまたいで1本に絞るのは定着の錠で、プロセスの中で1本に絞るのは呼び出し側。
//
// 書く口は決して reject しない（起こせない・中断・時間切れ・形の崩れ・写しの書き込み失敗はどれも理由つきの `failed`）。
// 行は未定着のまま残り、次の契機で拾い直される。
//
// 渡す行も前のあらすじも受け取る出力も会話の内容に当たる。
// メモリにだけ持ち、書くのは索引とあらすじのファイルだけで、ログには出さない。
// 書いてよい範囲と定着の `query()` へ渡してよい範囲は `docs/coding-standards.md`「会話内容の扱い」の例外の表が決めている。

import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import type { ChatSummary } from "../../session-driver/core/session-driver.ts"
import type { ChatArchive } from "./chat-archive-port.ts"
import {
  CHAT_CONSOLIDATION_TIMEOUT_MS,
  chatConsolidationQuery,
  chatEpisodeDrafts,
  type ChatConsolidationQuery,
  chatSummaryWithTopics,
  chatSynopsis,
  parseChatConsolidationResult,
  readChatTopics,
} from "./chat-consolidation.ts"

/**
 * 1回ぶんの結果。
 *
 * - `not-due`: 未定着の行が契機（`consolidateEveryBytes`）に届いていないので起こさなかった
 * - `locked`: ほかのプロセスが錠を持っているので起こさなかった（その契機は捨てる）
 * - `written`: 書けた。`topics` は書いたあとのファイルから読み直した最近の話題の見出し
 * - `failed`: 書けなかった。次の契機で拾い直す。`reason` で見分ける
 *   - `aborted`: 中断・時間切れ
 *   - `unreadable-result`: 結果が検査を通らない
 *   - `summary-write`: あらすじの写しが書けなかった
 *   - `threw`: 上以外の例外（起こせない・API の失敗など）。`error` は受け取った側が `error.name` と code だけを写す
 */
export type ChatConsolidationOutcome =
  | { readonly kind: "not-due" }
  | { readonly kind: "locked" }
  | { readonly kind: "written"; readonly topics: readonly string[] }
  | { readonly kind: "failed"; readonly reason: "aborted" | "unreadable-result" | "summary-write" }
  | { readonly kind: "failed"; readonly reason: "threw"; readonly error: unknown }

/** そのパックの定着を1回走らせる。`signal` が中断されたら、待たずに `failed` で返り、何も書かない。 */
export type ChatConsolidationWriter = (
  packName: string,
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
  /** 未定着の行の取り出しとエピソードの追記。 */
  readonly archive: Pick<ChatArchive, "unconsolidated" | "appendEpisodes">
  /**
   * そのパックの定着の錠を取る。プロセスをまたいで1本だけが取れる。
   * 取れなければ undefined（ほかの誰かが走らせている）。
   * 書いてから `staleAfterMs` を過ぎた錠は、落ちたプロセスの残りとして消して取り直す。
   */
  readonly lockConsolidation: (
    packName: string,
    staleAfterMs: number,
    now: Temporal.Instant,
  ) => ChatConsolidationLock | undefined
  /** パック1つぶんのあらすじの読み書き口（書くのは起こした時点のパックのファイル）。 */
  readonly chatSummary: (packName: string) => ChatSummary
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

export function createChatConsolidationWriter(
  ports: ChatConsolidationWriterPorts,
): ChatConsolidationWriter {
  return (packName, signal) => {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(CHAT_CONSOLIDATION_TIMEOUT_MS)])
    return Promise.race([consolidate(ports, packName, bounded), abortion(bounded)])
  }
}

async function consolidate(
  ports: ChatConsolidationWriterPorts,
  packName: string,
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
    return await consolidateLocked(ports, packName, signal)
  } finally {
    lock.release()
  }
}

async function consolidateLocked(
  ports: ChatConsolidationWriterPorts,
  packName: string,
  signal: AbortSignal,
): Promise<ChatConsolidationOutcome> {
  try {
    // 1回に畳むのは契機の2倍まで。溜まった量もこの読みで分かる。
    const batch = ports.archive.unconsolidated(packName, {
      recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes,
      maxBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes * 2,
    })
    // maxBytes に届いて打ち切ったとき（先頭の1件だけで超えるときを含む）は、契機に届いていなくてもここまでを渡す。
    // 待つと、残りの行がずっと畳まれなくなる。
    if (!batch.overflowed && batch.usedBytes < CHAT_MEMORY_BUDGET.consolidateEveryBytes) {
      return NOT_DUE
    }

    const chatSummary = ports.chatSummary(packName)
    const request = chatConsolidationQuery({
      entries: batch.entries,
      previousSynopsis: chatSynopsis(chatSummary.read()?.summary ?? ""),
      previousEpisodeTitle: batch.previousEpisodeTitle,
    })
    const result = parseChatConsolidationResult(
      await ports.query(request, signal),
      batch.entries.length,
    )
    // 中断・時間切れのあとに届いた結果は書かない（呼び出し側はもう次の1本を起こしうる）。
    if (signal.aborted) {
      return ABORTED
    }
    if (result === undefined) {
      return { kind: "failed", reason: "unreadable-result" }
    }

    ports.archive.appendEpisodes(packName, chatEpisodeDrafts(batch.entries, result.episodes))
    if (!chatSummary.write(chatSummaryWithTopics(result.synopsis, result.topics))) {
      return { kind: "failed", reason: "summary-write" }
    }
    return { kind: "written", topics: readChatTopics(chatSummary) }
  } catch (error) {
    return signal.aborted ? ABORTED : { kind: "failed", reason: "threw", error }
  }
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
