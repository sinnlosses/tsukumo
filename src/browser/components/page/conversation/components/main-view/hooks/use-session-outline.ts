// 左の札の側の切り替えとセッション側のロジック。
// 行はこの作業ツリーの今日と昨日（切り替え画面と同じ材料）で、選んだ行は札の中の印だけ（詳細は開かない）。
// 使用中の取得は、セッション側を出しているあいだだけ聞く。

import { useState } from "react"

import { useSessionRows } from "../../../../../../features/session-switcher/use-session-row-list.ts"
import { useSessionSwitcherRequest } from "../../../../../../stores/session-switcher-request.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import { useOutlineSide, type OutlineSide } from "../../../stores/outline-side.ts"
import { sessionOutline, type SessionOutlineSection } from "../domain/session-outline-row.ts"
import { useReportOutlineTurns } from "./use-report-outline-turn-list.ts"

export type SessionOutlineModel = {
  readonly side: OutlineSide
  readonly onSelectSide: (side: OutlineSide) => void
  readonly sections: readonly SessionOutlineSection[]
  readonly count: number
  /** 選んだ行の鍵。選んでいないあいだは空。 */
  readonly selectedKey: string
  readonly onSelectRow: (key: string) => void
  readonly onOpenSwitcher: () => void
}

export function useSessionOutline(): SessionOutlineModel {
  const side = useOutlineSide((state) => state.side)
  const shownAt = useOutlineSide((state) => state.shownAt)
  const selectSide = useOutlineSide((state) => state.selectSide)
  const firstTurnTitle = useReportOutlineTurns()[0]?.title
  const [mountedAt] = useState(nowEpochMilliseconds)
  const { rows, currentSessionId } = useSessionRows(side === "sessions", shownAt ?? mountedAt)
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)
  const [selectedKey, setSelectedKey] = useState("")
  const { sections, count } = sessionOutline({ rows, currentSessionId, firstTurnTitle })
  return {
    side,
    onSelectSide: (next) => {
      selectSide(next, nowEpochMilliseconds())
    },
    sections,
    count,
    selectedKey,
    onSelectRow: setSelectedKey,
    onOpenSwitcher: () => {
      openSwitcher(nowEpochMilliseconds())
    },
  }
}
