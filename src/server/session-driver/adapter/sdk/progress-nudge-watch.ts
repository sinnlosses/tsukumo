import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import { createProgressNudge, type ProgressNudgeSend } from "../../core/progress-nudge.ts"

/**
 * 進みの差し込み（`ProgressNudge`）に時計とタイマーを付ける。
 * タイマーは時計より少し早く発火することがあり、そのときは `take` が何も返さないので、残りの分だけ立て直す。
 */
export function watchProgressNudge(
  now: () => number,
  send: (taken: ProgressNudgeSend) => void,
): { readonly observe: (event: SessionEvent) => void; readonly close: () => void } {
  const nudge = createProgressNudge()
  let armedAt: number | undefined = undefined
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  const rearm = (): void => {
    const due = nudge.due()
    const nextAt = due.kind === "at" ? due.at : undefined
    if (nextAt === armedAt) {
      return
    }
    clearTimeout(timer)
    armedAt = nextAt
    timer = nextAt === undefined ? undefined : setTimeout(ring, Math.max(0, nextAt - now()))
  }
  const ring = (): void => {
    armedAt = undefined
    timer = undefined
    const taken = nudge.take(now())
    if (taken.kind !== "none") {
      send(taken)
    }
    rearm()
  }

  return {
    observe: (event) => {
      nudge.observe(event, now())
      rearm()
    },
    close: () => {
      clearTimeout(timer)
      armedAt = undefined
      timer = undefined
    },
  }
}
