// 駆動が送り出すイベントの出口。会話が終わったことを覚え、受け手の例外で反復を止めない。

import type { SessionEvent } from "../../../shared/session/session-event.ts"

export type SessionEnding = {
  /** イベントを受け手へ1件流す。受け手が投げたら `onHandlerFailed` へ渡し、投げ直さない。 */
  readonly deliver: (event: SessionEvent) => void
  /** `session-ended` を流したあとか。 */
  readonly ended: () => boolean
}

export function createSessionEnding(
  onEvent: (event: SessionEvent) => void,
  onHandlerFailed: (error: unknown) => void,
): SessionEnding {
  let ended = false
  return {
    deliver: (event) => {
      if (event.kind === "session-ended") {
        ended = true
      }
      try {
        onEvent(event)
      } catch (error) {
        onHandlerFailed(error)
      }
    },
    ended: () => ended,
  }
}
