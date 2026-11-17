// やり取りの列の入口。
// 左の列の上へ差し込む。hello 待ちのあいだは出さない。
// やり取りが1件も無いあいだ（始め方の一覧）は、題と件数 0 だけの帯を出す。
// 本文の札が出ているあいだは、やり取りの列を出す。

import type { ReactElement } from "react"

import { useMainViewTurns } from "../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../stores/turn-selection.ts"
import { useMainViewContent } from "../../stores/main-view-content.ts"
import { useReportOutlineTurns } from "./hooks/use-report-outline-turn-list.ts"
import { useReportOutline } from "./hooks/use-report-outline.ts"
import {
  EmptyReportOutline,
  PresentationalReportOutline,
} from "./presentational-report-outline.tsx"

export function ReportOutline(): ReactElement {
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const turns = useMainViewTurns()
  const welcome = useMainViewContent((state) => state.content.kind === "welcome")
  const awaitingHello = useSession((session) => session.generation === 0)
  const viewingPast = activeTurnId !== undefined && activeTurnId !== newestTurnId
  const shown = !awaitingHello && (!welcome || viewingPast) && turns.length >= 1
  const empty = !awaitingHello && turns.length === 0
  return (
    <>
      {empty && <EmptyReportOutline />}
      {shown && activeTurnId !== undefined && <ShownReportOutline activeTurnId={activeTurnId} />}
    </>
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
