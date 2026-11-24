// やり取りの列の入口。
// 左の列の上へ差し込む。hello 待ちのあいだは出さない。
// 本文の札が出ているあいだは開いた札（やり取り側・セッション側）を出し、
// やり取りが1件も無いあいだと、始め方の一覧を出していて過去を見ていないあいだは、切り替えの1行だけの帯を出す。
// 帯で「セッション」を押すと、その場でセッション側の札が開く。

import type { ReactElement } from "react"

import { useMainViewTurns } from "../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../stores/turn-selection.ts"
import { useMainViewContent } from "../../stores/main-view-content.ts"
import { useReportOutlineTurns } from "./hooks/use-report-outline-turn-list.ts"
import { useReportOutline } from "./hooks/use-report-outline.ts"
import { useSessionOutline } from "./hooks/use-session-outline.ts"
import { OutlineBand, PresentationalReportOutline } from "./presentational-report-outline.tsx"
import { PresentationalSessionOutline } from "./presentational-session-outline.tsx"

export function ReportOutline(): ReactElement {
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const turns = useMainViewTurns()
  const welcome = useMainViewContent((state) => state.content.kind === "welcome")
  const awaitingHello = useSession((session) => session.generation === 0)
  const viewingPast = activeTurnId !== undefined && activeTurnId !== newestTurnId
  const shown = !awaitingHello && (!welcome || viewingPast) && turns.length >= 1
  const banded = !awaitingHello && !shown
  return (
    <>
      {banded && <BandedReportOutline turnCount={turns.length} />}
      {shown && activeTurnId !== undefined && <ShownReportOutline activeTurnId={activeTurnId} />}
    </>
  )
}

function BandedReportOutline(props: { readonly turnCount: number }): ReactElement {
  const session = useSessionOutline(false)
  return (
    <OutlineBand
      turnCount={props.turnCount}
      sessionCount={session.count}
      onSelectSide={session.onSelectSide}
      sessionBody={
        session.side === "sessions" ? <PresentationalSessionOutline {...session} /> : undefined
      }
    />
  )
}

function ShownReportOutline(props: { readonly activeTurnId: number }): ReactElement {
  const { selectTurn } = useTurnSelection()
  const outline = useReportOutline({
    turns: useReportOutlineTurns(),
    activeTurnId: props.activeTurnId,
    onSelectTurn: selectTurn,
  })
  const session = useSessionOutline(outline.collapsed)
  return (
    <PresentationalReportOutline
      {...outline}
      side={session.side}
      sessionCount={session.count}
      sessionBody={<PresentationalSessionOutline {...session} />}
      onSelectSide={(side) => {
        session.onSelectSide(side)
        if (outline.collapsed) {
          outline.onToggleCollapse()
        }
      }}
    />
  )
}
