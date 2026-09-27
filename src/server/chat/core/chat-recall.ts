// `ChatRecall`（索引を引いて古い雑談を思い出す口）の実装（`docs/chat-mode.md`「古い雑談は索引を
// 引いて思い出す」）。ファイルには一切触らない——読むのは `ChatArchive`
// （雑談の会話のアーカイブを扱うアダプタ）で、ここは1ターンの回数の上限
// （`recallListsPerTurn` / `recallEpisodesPerTurn`）を数えるだけ（`docs/architecture.md`「1ファイル = 1つの境界」）。
//
// 上限に当たった呼び出しは `ChatArchive` を読まずに `"exhausted"` を返す。 アーカイブが
// 何年ぶん増えても、上限に当たった回はファイルを1つも開かない。
//
// ターンの終わりの合図は `PersonaMemory.finishTurn` と同じ call site に相乗りする
// （`relayMessages` の `turn-finished` 分岐。
// `docs/design.md`「雑談の記憶の置き場」）。

import {
  CHAT_MEMORY_BUDGET,
  type ChatMemoryBudget,
} from "../../../shared/chat/chat-memory-budget.ts"
import type { ChatArchive, ChatRecall } from "../../session-driver/core/session-driver.ts"

/**
 * `ChatRecall` を1つ作る（雑談モードのときだけ、配線の `sessionMode` から
 * 呼ばれる）。`packName` と読む量（`budget`）はここで縛ってから {@link ChatArchive} へ渡す。
 * `now` は現在時刻（エポックミリ秒。`docs/coding-standards.md`「外の世界に依存する値」に
 * 従い、時計は呼び出し側から渡す）。
 */
export function createChatRecall(
  chatArchive: ChatArchive,
  packName: string,
  now: () => number,
  budget: ChatMemoryBudget = CHAT_MEMORY_BUDGET,
): ChatRecall {
  // そのターンで引いた回数（別々に数える。`remember` / `forget` と同じ形）。
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
