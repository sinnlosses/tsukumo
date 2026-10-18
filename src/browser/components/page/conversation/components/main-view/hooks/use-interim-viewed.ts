// 働いているあいだに中間レポートを見たやり取りを覚えさせるフック。
// 閉じたあとに初めて開いたやり取りは覚えない（見出しの一覧の「新」を出す相手にしない）。
// やり取りの ID はセッションごとに振るので、セッションの世代が変わったときだけ覚えを捨てる（画面を隠して戻しても残す）。

import { useEffect } from "react"

import type { MainViewTurn } from "../../../../../../../shared/session/main-view-shape.ts"
import { useInterimViewing } from "../../../../../../stores/interim-viewing.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { hasShownInterim } from "../domain/new-heading.ts"

/** `shownTurn` は札に出しているやり取り（無ければ undefined）、`working` はそのやり取りがまだ閉じていないか。 */
export function useInterimViewed(shownTurn: MainViewTurn | undefined, working: boolean): void {
  const generation = useSession((session) => session.generation)
  const markViewed = useInterimViewing((state) => state.markViewed)
  const forgetUnlessGeneration = useInterimViewing((state) => state.forgetUnlessGeneration)
  const turnId = shownTurn?.id
  const interimShown = shownTurn !== undefined && hasShownInterim(shownTurn)

  useEffect(() => {
    forgetUnlessGeneration(generation)
  }, [forgetUnlessGeneration, generation])

  useEffect(() => {
    if (turnId !== undefined && working && interimShown) {
      markViewed(turnId)
    }
  }, [markViewed, turnId, working, interimShown])
}
