// 迎える口に並べる札を、状態・前回のセッションの要約・タスク一覧から用意する。

import { useSession } from "../../../../../stores/session.ts"
import { useSessionDigest } from "../../../../domain/screen-nav/hooks/use-session-digest.ts"
import {
  previousSessionOf,
  welcomeCardsOf,
  type WelcomeCard,
} from "../../domain/welcome-entries.ts"

export type WelcomeCards = {
  readonly cards: readonly WelcomeCard[]
  /** 前のセッションがあるか。 */
  readonly hasPrevious: boolean
}

export function useWelcomeCards(): WelcomeCards {
  const sessions = useSession((session) => session.state.sessions)
  const currentSessionId = useSession((session) =>
    session.state.session.kind === "starting" ? undefined : session.state.session.sessionId,
  )
  const tasks = useSession((session) => session.state.tasks)
  const recommendation = useSession((session) => session.state.recommendation)

  const previous = previousSessionOf(sessions, currentSessionId)
  const digest = useSessionDigest(previous?.sessionId)
  const summary = digest.kind === "known" ? digest.summary : undefined
  return {
    cards: welcomeCardsOf(recommendation, previous, summary, tasks),
    hasPrevious: previous !== undefined,
  }
}
