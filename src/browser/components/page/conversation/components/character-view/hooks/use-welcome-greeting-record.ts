// 吹き出しに出した迎えの挨拶の1行（札の名前込み）を、サーバへ渡して記録に積ませる。
// 文は札が届くたびに変わりうるので、出し始めたときと文が変わるたびに送る。
// 切れている間に送った分は捨てられるので、繋ぎ直すたびにも送り直す。
// 同じ文が二重に積まれないようにするのは受け手の側。

import { useEffect } from "react"

import {
  type WelcomeHead,
  welcomeGreetingLine,
} from "../../../../../../../shared/recommendation/welcome-greeting.ts"
import { greetingOnShow } from "../../../../../../../shared/session/shown-reaction.ts"
import { useSession } from "../../../../../../stores/session.ts"

export function useWelcomeGreetingRecord(head: WelcomeHead): void {
  const dispatch = useSession((session) => session.dispatch)
  const connected = useSession((session) => session.connection === "open")
  const greeting = useSession((session) => {
    const onShow = greetingOnShow(session.state)
    return onShow.kind === "shown" ? onShow.greeting : undefined
  })
  const line = greeting === undefined ? undefined : welcomeGreetingLine(greeting, head)
  const text = line?.text
  const expression = line?.expression

  useEffect(() => {
    if (!connected || text === undefined || expression === undefined) {
      return
    }
    void dispatch.session.recordWelcomeGreeting({ text, expression })
  }, [dispatch, connected, text, expression])
}
