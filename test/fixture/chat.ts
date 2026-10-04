// 雑談の記憶の口（`ChatSummary` / `ChatArchive`）の代役。
// 呼ばれ方を覚えたいテストは、ここの代役を広げて覚えたい口だけを差し替える。

import type { ChatArchive } from "../../src/server/chat/core/chat-archive-port.ts"
import type {
  ChatSummary,
  ChatSummaryRecord,
} from "../../src/server/session-driver/core/session-driver.ts"

/** 何も書かず、読むと空を返し、定着の錠はいつでも取れる `ChatArchive`。 */
export const NOOP_CHAT_ARCHIVE = {
  append: () => {},
  readRecent: () => [],
  unconsolidated: () => ({
    entries: [],
    usedBytes: 0,
    previousEpisodeTitle: "",
    overflowed: false,
  }),
  appendEpisodes: () => {},
  recallList: () => ({ kind: "not-found" }),
  recallEpisode: () => ({ kind: "not-found" }),
} satisfies ChatArchive

/** 読むと `record` を返し続け、書き込みは捨てる `ChatSummary`。 */
export function fixedChatSummary(record: ChatSummaryRecord | undefined): ChatSummary {
  return {
    read: () => record,
    write: () => true,
    markUndelivered: () => {},
    markDelivered: () => {},
  }
}

/** 書き込み（印は変えない）と届けた印をメモリ上の写しへ反映する `ChatSummary`。 */
export function inMemoryChatSummary(initial: ChatSummaryRecord | undefined): ChatSummary {
  let record = initial
  return {
    read: () => record,
    write: (summary) => {
      record = { summary, delivered: record?.delivered ?? false }
      return true
    },
    markUndelivered: () => {
      record = { summary: record?.summary ?? "", delivered: false }
    },
    markDelivered: () => {
      record = { summary: record?.summary ?? "", delivered: true }
    },
  }
}
