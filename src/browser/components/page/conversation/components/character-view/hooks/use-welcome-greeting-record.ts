// 吹き出しに出した迎えの挨拶の1行（札の名前込み）を、サーバへ渡して記録に積ませる。
// 文は札が届くたびに変わりうるので、出し始めたときと文が変わるたびに送る。
// 切れている間に送った分は捨てられるので、繋ぎ直すたびにも送り直す。
// 同じ文が二重に積まれないようにするのは受け手の側。

import { useEffect } from "react"

import {
  type WelcomeHead,
  welcomeGreetingLine,
} from "../../../../../../../shared/recommendation/welcome-greeting.ts"
import type { SessionState } from "../../../../../../../shared/session/session-state.ts"
import { greetingOnShow } from "../../../../../../../shared/session/shown-reaction.ts"
import { useSession } from "../../../../../../stores/session.ts"

export function useWelcomeGreetingRecord(state: SessionState, head: WelcomeHead): void {
  const dispatch = useSession((session) => session.dispatch)
  const connected = useSession((session) => session.connection === "open")
  const onShow = greetingOnShow(state)
  const line = onShow.kind === "shown" ? welcomeGreetingLine(onShow.greeting, head) : undefined
  const text = line?.text
  const expression = line?.expression

  useEffect(() => {
    if (!connected || text === undefined || expression === undefined) {
      return
    }
    void dispatch.session.recordWelcomeGreeting({ text, expression })
  }, [dispatch, connected, text, expression])
}
