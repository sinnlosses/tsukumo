import { toRestoredEvents } from "../../src/server/session-driver/core/session-restore.ts"
import type { Expression } from "../../src/shared/character-pack/expression.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"

// 本物の claude も起こさない
// （`listSessions` / `getSessionMessages` を呼ぶのは1つの境界に閉じ込めた側だけ。
// docs/architecture.md「1ファイル = 1つの境界」）。
export const EXPRESSIONS: readonly Expression[] = ["default", "thinking", "proud"]

/** 組み直した出来事だけを取り出す（時刻は見ない）。 */
export function eventsOf(messages: unknown): readonly SessionEvent[] {
  return toRestoredEvents(messages, EXPRESSIONS).map(({ event }) => event)
}

export function stamped(message: unknown, timestamp: string): unknown {
  return Object.assign({}, message, { timestamp })
}
