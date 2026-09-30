// `ChatRecall`（索引を引いて古い雑談を思い出す口）の実装。
// ファイルには触らず、1ターンの回数の上限（`recallListsPerTurn` / `recallEpisodesPerTurn`）を数えるだけ。
//
// 上限に当たった呼び出しは `ChatArchive` を読まずに `"exhausted"` を返す。
// アーカイブが何年ぶん増えても、上限に当たった回はファイルを1つも開かない。

import {
  CHAT_MEMORY_BUDGET,
  type ChatMemoryBudget,
} from "../../../shared/chat/chat-memory-budget.ts"
import type { ChatRecall } from "../../session-driver/core/session-driver.ts"
import type { ChatArchive } from "./chat-archive-port.ts"

/**
 * `ChatRecall` を1つ作る。`packName` と読む量（`budget`）はここで縛ってから {@link ChatArchive} へ渡す。
 * `now` は現在時刻（エポックミリ秒）。
 */
export function createChatRecall(
  chatArchive: ChatArchive,
  packName: string,
  now: () => number,
  budget: ChatMemoryBudget = CHAT_MEMORY_BUDGET,
): ChatRecall {
  // そのターンで引いた回数（一覧と開いた回を別々に数える）。
  let listCount = 0
  let episodeCount = 0

  return {
    recallList: (keyword) => {
      if (listCount >= budget.recallListsPerTurn) {
        return { kind: "exhausted" }
      }
      listCount += 1
      return chatArchive.recallList(
        packName,
        keyword,
        budget.recallListBytes,
        Temporal.Instant.fromEpochMilliseconds(now()),
      )
    },
    recallEpisode: (id) => {
      if (episodeCount >= budget.recallEpisodesPerTurn) {
        return { kind: "exhausted" }
      }
      episodeCount += 1
      return chatArchive.recallEpisode(
        packName,
        id,
        budget.recallEpisodeBytes,
        Temporal.Instant.fromEpochMilliseconds(now()),
      )
    },
    finishTurn: () => {
      listCount = 0
      episodeCount = 0
    },
  }
}
