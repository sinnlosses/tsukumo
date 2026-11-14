// 始め方の一覧の札を、状態・前回のセッションの要約・タスク一覧から用意する。
// 札のボタンは依頼をすぐ送り、キーは札を押すほか、ほかの口（入力欄・切り替え画面）を開く。

import {
  characterFaceInfo,
  type CharacterFaceInfo,
} from "../../../../../../domain/character-face.ts"
import { isOverlayOpen } from "../../../../../../hooks/open-overlay.ts"
import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"
import { useSessionSwitcherRequest } from "../../../../../../stores/session-switcher-request.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import type { WelcomeCard } from "../../../domain/welcome-entry-list.ts"
import { useWelcomeCards } from "../../hooks/use-welcome-card-list.ts"
import { welcomeKeyOf } from "../domain/welcome-key.ts"

export type WelcomeModel = {
  readonly cards: readonly WelcomeCard[]
  readonly face: CharacterFaceInfo
  /** 札の「始める」。入力欄を経由せず依頼を送る。 */
  readonly onStart: (card: WelcomeCard) => void
}

export function useWelcome(): WelcomeModel {
  const dispatch = useSession((session) => session.dispatch)
  const { cards, hasOtherSessions } = useWelcomeCards()
  const character = useSession((session) => session.state.character)
  const asking = useSession((session) => session.state.pending.length > 0)
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)

  function onSeePrevious(): void {
    openSwitcher(nowEpochMilliseconds())
  }

  function onStart(card: WelcomeCard): void {
    void dispatch.diagnostic.reportRecommendationPressed({ kind: card.kind })
    void dispatch.session.prompt({ text: card.request, images: [] })
  }

  useEventListener(document, "keydown", (event) => {
    if (asking || isOverlayOpen()) {
      return
    }
    const key = welcomeKeyOf({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      isComposing: event.isComposing,
      target: event.target ?? undefined,
    })
    if (key === undefined) {
      return
    }
    if (key.kind === "card") {
      const card = cards[key.index]
      if (card !== undefined) {
        event.preventDefault()
        onStart(card)
      }
    } else if (hasOtherSessions) {
      event.preventDefault()
      onSeePrevious()
    }
  })

  return {
    cards,
    face: characterFaceInfo(character),
    onStart,
  }
}
