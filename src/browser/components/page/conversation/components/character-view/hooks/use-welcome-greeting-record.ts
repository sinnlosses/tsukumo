// 吹き出しに出した迎えの挨拶の1行（札の名前込み）を、サーバへ渡して記録に積ませる。
// 文は札が届くたびに変わりうるので、出し始めたときと文が変わるたびに送る。
// 切れている間に送った分は捨てられるので、繋ぎ直すたびにも送り直す。
// 同じ文が二重に積まれないようにするのは受け手の側。

import {
  type WelcomeHead,
  welcomeGreetingLine,
} from "../../../../../../../shared/recommendation/welcome-greeting.ts"
import { greetingOnShow } from "../../../../../../../shared/session/shown-reaction.ts"
import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
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

  // 接続の復帰や文の変化は store の値の変化で、利用者の操作ではない。送るハンドラに置ける場所が無いので同期として書く。
  useExternalSync(() => {
    if (!connected || text === undefined || expression === undefined) {
      return
    }
    void dispatch.session.recordWelcomeGreeting({ text, expression })
  }, [dispatch, connected, text, expression])
}
