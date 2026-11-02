// 読んだ未定着の行が、畳む契機に届いたかの判定。

import type { ChatUnconsolidatedBatch } from "../archive/chat-archive-port.ts"
import { CHAT_MEMORY_BUDGET } from "../memory/chat-memory-budget.ts"

/**
 * 読んだ未定着の行が、畳む契機（`consolidateEveryBytes`）に届いたか。
 * 打ち切った（`overflowed`）ときは、バイト数が届いていなくても届いたものとする。
 * 行が1件も無いかどうかは見ない。
 */
export function isConsolidationDue(
  batch: Pick<ChatUnconsolidatedBatch, "overflowed" | "usedBytes">,
): boolean {
  return batch.overflowed || batch.usedBytes >= CHAT_MEMORY_BUDGET.consolidateEveryBytes
}
