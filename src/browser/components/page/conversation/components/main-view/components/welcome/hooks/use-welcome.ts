// 迎える口の口を、セッションの姿と前回のセッションの要約から用意する。

import { useComposerDraft } from "../../../../../../../../stores/composer-draft.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { useSessionDigest } from "../../../../../../../domain/screen-nav/hooks/use-session-digest.ts"
import {
  previousSessionOf,
  welcomeEntriesOf,
  type WelcomeEntries,
} from "../domain/welcome-entries.ts"

export type WelcomeModel = {
  readonly entries: WelcomeEntries
  /** 口を押す。下書きの末尾に依頼の文を足すだけで、送らない。 */
  readonly onChoose: (request: string) => void
}

export function useWelcome(): WelcomeModel {
  const sessions = useSession((session) => session.state.sessions)
  const currentSessionId = useSession((session) =>
    session.state.session.kind === "starting" ? undefined : session.state.session.sessionId,
  )
  const tasks = useSession((session) => session.state.tasks)
  const appendToDraft = useComposerDraft((state) => state.appendToDraft)

  const previous = previousSessionOf(sessions, currentSessionId)
  const digest = useSessionDigest(previous?.sessionId)
  const summary = digest.kind === "known" ? digest.summary : undefined

  return {
    entries: welcomeEntriesOf(previous, summary, tasks),
    onChoose: appendToDraft,
  }
}
