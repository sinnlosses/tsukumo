// 入力欄が見せているセッションが変わったときに、下書きを差し替える。
// セッションの ID は React の外（フレームの受信）で変わるので、`useSession` の更新を購読して下書きの store へ書く。
// 読み込み時に1回だけ購読を始め、読み込み時点のセッションから初回を処理する。

import type { SessionId } from "../../../../../shared/session/session-id.ts"
import { useSession } from "../../../../stores/session.ts"
import { draftOnSessionChange } from "../domain/composer-draft-storage.ts"
import { useComposerDraft } from "./composer-draft.ts"

/** 確定前（`starting`）は `id` が無い。 */
type ShownSession = { readonly id?: SessionId }

function shownSession(): ShownSession {
  const { session } = useSession.getState().state
  return session.kind === "starting" ? {} : { id: session.sessionId }
}

function replaceOnSessionChange(previous: ShownSession, next: ShownSession): void {
  const shown = draftOnSessionChange(previous.id, next.id, useComposerDraft.getState().draft)
  if (shown !== undefined) {
    useComposerDraft.getState().replaceDraft(shown)
  }
}

let previousSession = shownSession()
replaceOnSessionChange({}, previousSession)

useSession.subscribe(() => {
  const next = shownSession()
  if (next.id === previousSession.id) {
    return
  }
  const previous = previousSession
  previousSession = next
  replaceOnSessionChange(previous, next)
})
