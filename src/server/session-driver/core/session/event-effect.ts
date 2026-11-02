// 流れてきたイベント1件に対して、駆動がやることの列を決める。

import type { TurnOutcome } from "../../../../shared/session-driver/turn-failure.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import type { ChatSummary, PersonaMemory } from "../../../chat/core/memory/chat-memory.ts"
import type { SessionMode } from "../session-driver.ts"
import type { SessionId } from "../session-id.ts"

/** 実行に要る値は効果に載せる。実行する側は条件を確かめ直さない。 */
export type EventEffect =
  | { readonly kind: "append-input-ledger"; readonly outcome: TurnOutcome }
  | { readonly kind: "finish-persona-turn"; readonly personaMemory: PersonaMemory }
  | { readonly kind: "mark-session-and-write-title"; readonly sessionId: SessionId }
  | { readonly kind: "mark-summary-undelivered"; readonly chatSummary: ChatSummary }
  | { readonly kind: "note-conversation-cleared" }

/**
 * 返す列の順に実行する。
 * `sessionId` は `session-info` から受け取り済みのもの（まだなら `undefined`）。
 */
export function effectsOfEvent(
  event: SessionEvent,
  fromMain: boolean,
  mode: SessionMode,
  sessionId: SessionId | undefined,
): readonly EventEffect[] {
  if (event.kind === "turn-finished") {
    return [
      ...(fromMain ? [{ kind: "append-input-ledger", outcome: event.outcome } as const] : []),
      ...(mode.kind === "chat"
        ? [{ kind: "finish-persona-turn", personaMemory: mode.personaMemory } as const]
        : []),
      ...(sessionId !== undefined
        ? [{ kind: "mark-session-and-write-title", sessionId } as const]
        : []),
    ]
  }
  if (event.kind === "conversation-cleared") {
    return [
      ...(mode.kind === "chat"
        ? [{ kind: "mark-summary-undelivered", chatSummary: mode.chatSummary } as const]
        : []),
      { kind: "note-conversation-cleared" },
    ]
  }
  return []
}
