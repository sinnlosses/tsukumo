// 定着を1回走らせて書く口（`docs/design.md` 7章「定着はどこで走るか」、`docs/chat-mode.md` 4.9
// 「窓から溢れた会話は定着で畳む」）。未定着の行を数え、契機に届いていれば使い捨ての `query()`
// （`src/server/chat/adapter/sdk-chat-consolidation.ts`）に畳ませ、検査を通ったものを
// エピソード → あらすじの順で書く。形は `visit/core/visit-script-writer.ts` に揃える。
//
// いつ呼ぶか（雑談のターンの終わり）と、同時に1本に絞るのは呼び出し側
// （`src/server/session/core/session-manager.ts`）。ここは1回ぶんだけを持つ。
//
// 書く口は決して reject しない（起こせない・中断・時間切れ・形の崩れはどれも `failed`）。
// 行は未定着のまま残り、次の契機で拾い直される。常駐プロセスは定着1回の失敗で落ちない。
//
// 渡す行も前のあらすじも受け取る出力も会話の内容に当たる。メモリにだけ持ち、書くのは索引と
// あらすじのファイルだけで、ログには出さない（docs/coding-standards.md「会話内容の扱い」）。

import { CHAT_MEMORY_BUDGET } from "../../../shared/chat-memory-budget.ts"
import { type ChatArchive, type ChatSummary } from "../../session-driver/core/session-driver.ts"
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
 * - `written`: 書けた。`topics` は書いたあとのファイルから読み直した最近の話題の見出し
 * - `failed`: 起こせない・中断・時間切れ・形の崩れ（理由は問わない。次の契機で拾い直す）
 */
export type ChatConsolidationOutcome =
  | { readonly kind: "not-due" }
  | { readonly kind: "written"; readonly topics: readonly string[] }
  | { readonly kind: "failed" }

/** そのパックの定着を1回走らせる。`signal` が中断されたら、待たずに `failed` で返り、何も書かない。 */
export type ChatConsolidationWriter = (
  packName: string,
  signal: AbortSignal,
) => Promise<ChatConsolidationOutcome>

/**
 * 定着の出どころ。
 *
 * - `dont-consolidate`: 走らせない（疑似セッション。claude を起こさない）
 * - `consolidate`: 雑談のターンの終わりに走らせる
 */
export type ChatConsolidationSource =
  | { readonly kind: "dont-consolidate" }
  | { readonly kind: "consolidate"; readonly consolidate: ChatConsolidationWriter }

/** 書く口に外の世界から渡すもの（配線は `src/session-start.ts`）。 */
export type ChatConsolidationWriterPorts = {
  /** 未定着の行の取り出しとエピソードの追記。 */
  readonly archive: Pick<ChatArchive, "unconsolidated" | "appendEpisodes">
  /** パック1つぶんのあらすじの読み書き口（書くのは起こした時点のパックのファイル）。 */
  readonly chatSummary: (packName: string) => ChatSummary
  /** 使い捨ての `query()`。返すのは `structured_output` のまま（検査はここでする）。 */
  readonly query: (request: ChatConsolidationQuery, signal: AbortSignal) => Promise<unknown>
}

const FAILED = { kind: "failed" } as const satisfies ChatConsolidationOutcome
const NOT_DUE = { kind: "not-due" } as const satisfies ChatConsolidationOutcome

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
  try {
    // 1回に畳むのは契機の2倍まで（`docs/chat-mode.md` 4.9）。溜まった量もこの読みで分かる。
    const batch = ports.archive.unconsolidated(packName, {
      recentBytes: CHAT_MEMORY_BUDGET.recentBytes,
      maxBytes: CHAT_MEMORY_BUDGET.consolidateEveryBytes * 2,
    })
    if (batch.usedBytes < CHAT_MEMORY_BUDGET.consolidateEveryBytes) {
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
    if (result === undefined || signal.aborted) {
      return FAILED
    }

    ports.archive.appendEpisodes(packName, chatEpisodeDrafts(batch.entries, result.episodes))
    chatSummary.write(chatSummaryWithTopics(result.synopsis, result.topics))
    return { kind: "written", topics: readChatTopics(chatSummary) }
  } catch {
    // 起こせない・中断・API の失敗。どれも行を残して次の契機に回すだけなので分けない。
    return FAILED
  }
}

/** `signal` が中断されたら `failed` で返る（口が中断を無視しても待たない）。 */
function abortion(signal: AbortSignal): Promise<ChatConsolidationOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(FAILED)
      return
    }
    signal.addEventListener(
      "abort",
      () => {
        resolve(FAILED)
      },
      { once: true },
    )
  })
}
