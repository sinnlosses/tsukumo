// やり取りの列の入口。
// 左の列の上へ差し込む。本文の札が出ているあいだ（始め方の一覧と hello 待ちを除く）だけ出す。

import type { ReactElement } from "react"

import { useMainViewTurns } from "../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../stores/turn-selection.ts"
import { useMainViewContent } from "../../stores/main-view-content.ts"
import { useReportOutlineTurns } from "./hooks/use-report-outline-turn-list.ts"
import { useReportOutline } from "./hooks/use-report-outline.ts"
import { PresentationalReportOutline } from "./presentational-report-outline.tsx"

export function ReportOutline(): ReactElement {
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const turns = useMainViewTurns()
  const welcome = useMainViewContent((state) => state.content.kind === "welcome")
  const awaitingHello = useSession((session) => session.generation === 0)
  const viewingPast = activeTurnId !== undefined && activeTurnId !== newestTurnId
  const shown = !awaitingHello && (!welcome || viewingPast) && turns.length >= 1
  return (
    <>{shown && activeTurnId !== undefined && <ShownReportOutline activeTurnId={activeTurnId} />}</>
  )
}

function ShownReportOutline(props: { readonly activeTurnId: number }): ReactElement {
  const { selectTurn } = useTurnSelection()
  return (
    <PresentationalReportOutline
      {...useReportOutline({
        turns: useReportOutlineTurns(),
        activeTurnId: props.activeTurnId,
        onSelectTurn: selectTurn,
      })}
    />
  )
}
