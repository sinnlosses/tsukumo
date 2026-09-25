// `ChatRecall`（索引を引いて古い雑談を思い出す口）の実装（`docs/design.md` 7章「エピソード索引は
// どこに置くか」）。ファイルには一切触らない——読むのは {@link ChatArchive}
// （`src/server/chat/adapter/chat-archive.ts`）で、ここは**1ターンの回数の上限
// （`recallListsPerTurn` / `recallEpisodesPerTurn`）を数えるだけ**（原則3）。
//
// **上限に当たった呼び出しは {@link ChatArchive} を読まずに `"exhausted"` を返す。** アーカイブが
// 何年ぶん増えても、上限に当たった回はファイルを1つも開かない。
//
// **ターンの終わりの合図は `PersonaMemory.finishTurn` と同じ call site に相乗りする**
// （`src/server/session-driver/adapter/sdk-driver.ts` の `turn-finished` 分岐。
// `docs/design.md` 7章「ターンの終わりの合図は今の finishTurn に相乗りする」）。

import { CHAT_MEMORY_BUDGET, type ChatMemoryBudget } from "../../../shared/chat-memory-budget.ts"
import { type ChatArchive, type ChatRecall } from "../../session-driver/core/session-driver.ts"

/**
 * `ChatRecall` を1つ作る（雑談モードのときだけ、`src/session-start.ts` の `sessionMode` から
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
  // そのターンで引いた回数（**別々に数える**。`remember` / `forget` と同じ形）。
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
