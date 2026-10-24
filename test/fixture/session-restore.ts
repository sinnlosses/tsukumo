import {
  EMPTY_INPUT_LEDGER,
  type InputLedger,
} from "../../src/server/session-driver/core/input-ledger.ts"
import { toRestoredEvents } from "../../src/server/session-driver/core/session-restore.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { EXPRESSIONS } from "./sdk-assistant-message.ts"

// 本物の claude も起こさない
// （`listSessions` / `getSessionMessages` を呼ぶのは1つの境界に閉じ込めた側だけ。
// docs/architecture/overview-and-layer.md「1ファイル = 1つの境界」）。

/** 組み直した出来事だけを取り出す（時刻は見ない）。`ledger` を渡さなければ控えの無いセッションとして組む。 */
export function eventsOf(
  messages: unknown,
  ledger: InputLedger = EMPTY_INPUT_LEDGER,
): readonly SessionEvent[] {
  return toRestoredEvents(messages, EXPRESSIONS, ledger).map(({ event }) => event)
}

export function stamped(message: unknown, timestamp: string): unknown {
  return Object.assign({}, message, { timestamp })
}
