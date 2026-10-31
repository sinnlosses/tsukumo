// 始め方の一覧に並べる札を、状態・前回のセッションの残り・タスク一覧から用意する。

import { conversationMoment } from "../../../../../../shared/session/conversation-moment.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useSessionDigest } from "../../../../domain/screen-nav/hooks/use-session-digest.ts"
import {
  hasOtherSession,
  previousSessionOf,
  welcomeCardsOf,
  type ResumeSource,
  type WelcomeCard,
} from "../../domain/welcome-entry-list.ts"

type WelcomeCards = {
  readonly cards: readonly WelcomeCard[]
  /** 切り替え画面で選べる、いまのセッション以外の行があるか（「前のやり取りを見る」を出すか）。 */
  readonly hasOtherSessions: boolean
}

export function useWelcomeCards(): WelcomeCards {
  const sessions = useSession((session) => session.state.sessions)
  const currentSessionId = useSession((session) =>
    session.state.session.kind === "starting" ? undefined : session.state.session.sessionId,
  )
  const tasks = useSession((session) => session.state.tasks)
  const recommendation = useSession((session) => session.state.recommendation)

  const greeting = useSession((session) => conversationMoment(session.state) === "greet")

  const otherSessions = sessions.filter((session) => session.sessionId !== currentSessionId)
  const previous = previousSessionOf(otherSessions)
  // 札と挨拶が出うる局面（始め方の一覧）のあいだだけ取りに行く。
  const digest = useSessionDigest(
    greeting && previous !== undefined
      ? { kind: "session", sessionId: previous.sessionId }
      : { kind: "none" },
  )
  const resume: ResumeSource =
    previous !== undefined && digest.kind === "known" && digest.remaining !== undefined
      ? { kind: "available", session: previous, remaining: digest.remaining }
      : { kind: "none" }
  return {
    cards: welcomeCardsOf(recommendation, resume, tasks),
    hasOtherSessions: hasOtherSession(otherSessions),
  }
}
