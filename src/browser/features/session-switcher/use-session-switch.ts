// セッションを切り替える口。切り替え画面と札の詳細が同じ道（起こし直しの拒み・使用中の断り・いまの行の見逃し・サーバの断り）を通る。
// 切り替えを受け付けたときだけ `beforeSwitch` を呼ぶので、呼ぶ側は自分の面を閉じる手をそこへ渡す。

import { FRAME_ERROR_REASON } from "../../../shared/frame-error-reason.ts"
import type { SessionId } from "../../../shared/session/session-id.ts"
import { useSessionSwitcherRequest } from "../../stores/session-switcher-request.ts"
import { useRestartRefused, useSession } from "../../stores/session.ts"
import { nowEpochMilliseconds } from "../../utils/clock.ts"
import type { SessionSwitcherRow } from "./session-switcher-row.ts"

type SessionSwitch = {
  /** `restartRefused` の間は切り替えを送らない（起こし直しなので）。 */
  readonly blocked: boolean
  /** `blocked` のときだけ理由を持つ。 */
  readonly blockedTitle?: string
  readonly switchSession: (sessionId: SessionId, beforeSwitch: () => void) => void
}

export function useSessionSwitch(rows: readonly SessionSwitcherRow[]): SessionSwitch {
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const currentSessionId = useSession((session) =>
    session.state.session.kind === "starting" ? undefined : session.state.session.sessionId,
  )
  const restartRefused = useRestartRefused()
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)

  const onSwitchAnswered = async (sessionId: string): Promise<void> => {
    const result = await dispatchAwaited((client) => client.session.switchSession({ sessionId }))
    if (result.kind === "invalid" && result.reason === FRAME_ERROR_REASON.sessionOccupied) {
      openSwitcher(nowEpochMilliseconds())
    }
  }

  return {
    blocked: restartRefused,
    blockedTitle: restartRefused ? FRAME_ERROR_REASON.sessionSwitchDuringTurn : undefined,
    switchSession: (sessionId, beforeSwitch) => {
      if (
        restartRefused ||
        rows.some((row) => row.sessionId === sessionId && row.occupiedElsewhere)
      ) {
        return
      }
      beforeSwitch()
      // いま出しているものを選び直しても起こし直さない（会話が消えるだけで何も変わらない）。
      if (sessionId === currentSessionId) {
        return
      }
      // 開いたあとで別のウィンドウが開いたセッションは、サーバが起こす直前に断る。
      // 開き直すと使用中を聞き直すので、その行が使用中で出る。ほかの失敗は画面に出さない。
      void onSwitchAnswered(sessionId)
    },
  }
}
