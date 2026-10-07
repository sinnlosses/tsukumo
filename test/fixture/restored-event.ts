import type { RestoredEvent, SessionEvent } from "../../src/shared/session/session-event.ts"

export function knownRestored(
  events: readonly SessionEvent[],
  at = 1_000,
): readonly RestoredEvent[] {
  return events.map((event) => ({ event, time: { kind: "known", at } }))
}

export function unknownRestored(events: readonly SessionEvent[]): readonly RestoredEvent[] {
  return events.map((event) => ({ event, time: { kind: "unknown" } }))
}
