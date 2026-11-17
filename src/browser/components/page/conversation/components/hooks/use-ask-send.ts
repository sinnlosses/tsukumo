// レポートの「聞く」から、指した所つきの問いを送り方 `ask` で送る。
// 入力欄とは別の送り口で、作業中でも待ちでも送れる。つながっていないときと会話が終わったあとは送らない。

import type { ReplyTarget } from "../../../../../../shared/session/reply-target.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useAwaySeam } from "../../stores/away-seam.ts"

/** 返す約束は、サーバが問いを受け付けたあとに済む（補足のイベントは、受け付けの返事より先に届く）。 */
export function useAskSend(): (target: ReplyTarget, text: string) => Promise<void> {
  const dispatch = useSession((session) => session.dispatch)
  const sendable = useSession(
    (session) => session.connection === "open" && session.state.endedReason === undefined,
  )
  const dismissAwaySeam = useAwaySeam((state) => state.dismiss)
  return async (target, text) => {
    if (!sendable) {
      return
    }
    dismissAwaySeam()
    await dispatch.session.prompt({ text, images: [], routing: "ask", target })
  }
}
