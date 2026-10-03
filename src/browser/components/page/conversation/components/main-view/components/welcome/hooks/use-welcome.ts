// 迎える口の札と「ほかの始め方」を、状態・前回のセッションの要約・タスク一覧から用意する。
// 押す口とキーは、どちらも依頼をすぐ送るか、ほかの口（入力欄・タスクのモーダル・切り替え画面）を開く。

import { useEffect } from "react"

import {
  characterFaceInfo,
  type CharacterFaceInfo,
} from "../../../../../../../../domain/character-face.ts"
import { isOverlayOpen } from "../../../../../../../../hooks/open-overlay.ts"
import { useComposerFocus } from "../../../../../../../../stores/composer-focus.ts"
import { useSessionSwitcherRequest } from "../../../../../../../../stores/session-switcher-request.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../../../../../../stores/task-board-request.ts"
import type { WelcomeCard } from "../../../../../domain/welcome-entries.ts"
import { useWelcomeCards } from "../../../../hooks/use-welcome-cards.ts"
import { welcomeKeyOf } from "../domain/welcome-key.ts"

export type WelcomeModel = {
  readonly cards: readonly WelcomeCard[]
  readonly face: CharacterFaceInfo
  /** 前のセッションがあるか（「前のやり取りを見る」を出すか）。 */
  readonly hasPrevious: boolean
  /** 札の「始める」。入力欄を経由せず依頼を送る。 */
  readonly onStart: (request: string) => void
  readonly onWrite: () => void
  readonly onPickTask: () => void
  readonly onSeePrevious: () => void
}

export function useWelcome(): WelcomeModel {
  const dispatch = useSession((session) => session.dispatch)
  const { cards, hasPrevious } = useWelcomeCards()
  const character = useSession((session) => session.state.character)
  const asking = useSession((session) => session.state.pending.length > 0)
  const requestFocus = useComposerFocus((state) => state.requestFocus)
  const openList = useTaskBoardRequest((state) => state.openList)
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)

  function onStart(request: string): void {
    dispatch.session.prompt({ text: request, images: [] })
  }

  // 購読先は `document` の `keydown`（React の外）。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (asking || isOverlayOpen()) {
        return
      }
      const key = welcomeKeyOf({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        isComposing: event.isComposing,
        target: event.target,
      })
      if (key === undefined) {
        return
      }
      if (key.kind === "card") {
        const card = cards[key.index]
        if (card !== undefined) {
          event.preventDefault()
          onStart(card.request)
        }
      } else if (key.kind === "write") {
        event.preventDefault()
        requestFocus()
      } else if (hasPrevious) {
        event.preventDefault()
        openSwitcher()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  })

  return {
    cards,
    face: characterFaceInfo(character),
    hasPrevious,
    onStart,
    onWrite: requestFocus,
    onPickTask: openList,
    onSeePrevious: openSwitcher,
  }
}
