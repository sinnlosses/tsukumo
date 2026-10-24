// 画面の WebSocket が受けた text フレーム1つから、`events` の `kind` ごとの件数を読む。

import { z } from "zod"

import { parseServerFrame } from "../../../src/shared/frame.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"

const socketMessageSchema = z.object({
  p: z.object({ e: z.literal("message"), d: z.object({ json: z.unknown() }) }),
})

/** WebSocket の text フレーム 1 つが運ぶ `events` の `kind` ごとの件数。読めないフレームと `events` でないフレームは空。 */
export function countEventKinds(payload: string): ReadonlyMap<SessionEvent["kind"], number> {
  const counts = new Map<SessionEvent["kind"], number>()
  let value: unknown
  try {
    value = JSON.parse(payload)
  } catch {
    return counts
  }
  const message = socketMessageSchema.safeParse(value)
  const frame = message.success ? parseServerFrame(message.data.p.d.json) : undefined
  if (frame?.type !== "events") {
    return counts
  }
  for (const { event } of frame.events) {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1)
  }
  return counts
}
