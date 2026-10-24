// 画面の WebSocket が受ける `events` フレームの text（oRPC の封筒つき）を作る。

import type { SessionEvent } from "../../src/shared/session/session-event.ts"

export function eventsFrame(events: readonly SessionEvent[]): string {
  return JSON.stringify({
    i: "1",
    t: 3,
    p: {
      e: "message",
      d: { json: { type: "events", events: events.map((event) => ({ at: 0, event })) } },
    },
  })
}
