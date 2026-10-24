// 雑談の記憶の口（`ChatSummary` / `ChatArchive`）の代役。
// 呼ばれ方を覚えたいテストは、ここの代役を広げて覚えたい口だけを差し替える。

import type { ChatArchive } from "../../src/server/chat/core/chat-archive-port.ts"
import type {
  ChatSummary,
  ChatSummaryFold,
  ChatSummaryRecord,
} from "../../src/server/session-driver/core/session-driver.ts"

/** 何も書かず（画像は書けなかったと返す）、読むと空を返し、定着の錠はいつでも取れる `ChatArchive`。 */
export const NOOP_CHAT_ARCHIVE = {
  append: () => {},
  writeImage: () => Promise.resolve({ kind: "failed", error: undefined }),
  readRecent: () => [],
  unconsolidated: () => ({ entries: [], usedBytes: 0, overflowed: false }),
  appendedBytes: () => 0,
} satisfies ChatArchive

/** 読むと `record` を返し続け、書き込みは捨てる `ChatSummary`。 */
export function fixedChatSummary(record: ChatSummaryRecord | undefined): ChatSummary {
  return {
    read: () => record,
    readTopics: () => [],
    readFold: () => ({ kind: "unknown" }),
    write: () => ({ kind: "written", droppedLines: 0 }),
    markUndelivered: () => {},
    markDelivered: () => {},
  }
}

/** 書き込み（印は変えない）と届けた印をメモリ上の写しへ反映する `ChatSummary`。 */
export function inMemoryChatSummary(initial: ChatSummaryRecord | undefined): ChatSummary {
  let record = initial
  let topics: readonly string[] = []
  let fold: ChatSummaryFold = { kind: "unknown" }
  return {
    read: () => record,
    readTopics: () => topics,
    readFold: () => fold,
    write: (summary, nextTopics, foldedThrough) => {
      record = { summary, delivered: record?.delivered ?? false }
      topics = nextTopics
      fold = { kind: "through", at: foldedThrough }
      return { kind: "written", droppedLines: 0 }
    },
    markUndelivered: () => {
      record = { summary: record?.summary ?? "", delivered: false }
    },
    markDelivered: () => {
      record = { summary: record?.summary ?? "", delivered: true }
    },
  }
}
