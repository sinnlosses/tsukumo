// レポートの「聞く」から、指した所つきの問いを送り方 `ask` で送る。
// 入力欄とは別の送り口で、作業中でも待ちでも送れる。つながっていないときと会話が終わったあとは送らない。

import type { ReplyTarget } from "../../../../../../shared/session/reply-target.ts"
import { useSession } from "../../../../../stores/session.ts"

export function useAskSend(): (target: ReplyTarget, text: string) => void {
  const dispatch = useSession((session) => session.dispatch)
  const sendable = useSession(
    (session) => session.connection === "open" && session.state.endedReason === undefined,
  )
  return (target, text) => {
    if (!sendable) {
      return
    }
    void dispatch.session.prompt({ text, images: [], routing: "ask", target })
  }
}
