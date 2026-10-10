// やり取りの並びの材料。本文の左のやり取りの列と、狭い画面の引き出しの「やり取り」のタブが同じものを読む。
// 古い順（末尾が最新）で、窓の中のやり取りだけ（`useMainViewTurns`）。

import { zip } from "remeda"

import { conversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import { turnAsides } from "../../../../../../../shared/session/main-view.ts"
import { turnResultsOf, type TurnResult } from "../../../../../../../shared/session/turn-result.ts"
import { useMainViewTurns } from "../../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { turnTitle } from "../domain/turn-title.ts"

/** やり取り1件。題・結果・脇の話の数。 */
export type ReportOutlineTurnEntry = {
  readonly id: number
  readonly title: string
  readonly result: TurnResult
  readonly asideCount: number
}

export function useReportOutlineTurns(): readonly ReportOutlineTurnEntry[] {
  const turns = useMainViewTurns()
  const moment = useSession((session) => conversationMoment(session.state))
  return zip(turns, turnResultsOf(turns, moment)).map(([turn, result]) => ({
    id: turn.id,
    title: turnTitle(turn),
    result,
    asideCount: turnAsides(turn).length,
  }))
}
