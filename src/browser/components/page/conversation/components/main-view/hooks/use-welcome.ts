// 始め方の一覧の札と「ほかの始め方」を、状態・前回のセッションの要約・タスク一覧から用意する。
// 札のボタンとキーは、送る依頼の文面を見せる確認を開き、確認の「頼む」で送る。ほかの始め方はほかの口（入力欄・タスクのモーダル・切り替え画面）を開く。

import { useState } from "react"

import {
  characterFaceInfo,
  type CharacterFaceInfo,
} from "../../../../../../domain/character-face.ts"
import { isOverlayOpen } from "../../../../../../hooks/open-overlay.ts"
import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"
import { useComposerFocus } from "../../../../../../stores/composer-focus.ts"
import { useSessionSwitcherRequest } from "../../../../../../stores/session-switcher-request.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../../../../stores/task-board-request.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import type { WelcomeCard } from "../../../domain/welcome-entry-list.ts"
import { useWelcomeCards } from "../../hooks/use-welcome-card-list.ts"
import { welcomeKeyOf } from "../domain/welcome-key.ts"

export type WelcomeModel = {
  readonly cards: readonly WelcomeCard[]
  readonly face: CharacterFaceInfo
  /** 切り替え画面で選べる、いまのセッション以外の行があるか（「前のやり取りを見る」を出すか）。 */
  readonly hasOtherSessions: boolean
  /** 確認を開いている札。開いていなければ無い。 */
  readonly confirming?: WelcomeCard
  /** 札の「始める」。送る前の確認を開く。 */
  readonly onStart: (card: WelcomeCard) => void
  /** 確認の「頼む」。入力欄を経由せず依頼を送って確認を閉じる。 */
  readonly onConfirm: (card: WelcomeCard) => void
  readonly onCancel: () => void
  readonly onWrite: () => void
  readonly onPickTask: () => void
  readonly onSeePrevious: () => void
}

export function useWelcome(): WelcomeModel {
  const dispatch = useSession((session) => session.dispatch)
  const { cards, hasOtherSessions } = useWelcomeCards()
  const character = useSession((session) => session.state.character)
  const asking = useSession((session) => session.state.pending.length > 0)
  const requestFocus = useComposerFocus((state) => state.requestFocus)
  const openList = useTaskBoardRequest((state) => state.openList)
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)
  const [confirming, setConfirming] = useState<WelcomeCard>()

  function onSeePrevious(): void {
    openSwitcher(nowEpochMilliseconds())
  }

  function onStart(card: WelcomeCard): void {
    setConfirming(card)
  }

  function onConfirm(card: WelcomeCard): void {
    void dispatch.diagnostic.reportRecommendationPressed({ kind: card.kind })
    void dispatch.session.prompt({ text: card.request, images: [] })
    setConfirming(undefined)
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
    hasOtherSessions,
    ...(confirming !== undefined && { confirming }),
    onStart,
    onConfirm,
    onCancel: () => {
      setConfirming(undefined)
    },
    onWrite: requestFocus,
    onPickTask: () => {
      openList("")
    },
    onSeePrevious,
  }
}
