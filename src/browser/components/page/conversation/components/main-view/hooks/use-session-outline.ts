// 左の札の側の切り替えとセッション側のロジック。
// 行はこの作業ツリーの今日と昨日（切り替え画面と同じ材料）。
// 行を押すと札の右隣に詳細を開き、同じ行をもう一度押すと閉じる。切り替えるのは詳細のボタンだけ。
// 使用中の取得は、セッション側を出しているあいだだけ聞く。

import { useState } from "react"

import { characterFaceInfo } from "../../../../../../domain/character-face.ts"
import type { SessionSwitcherRow } from "../../../../../../features/session-switcher/session-switcher-row.ts"
import type { SessionDigestView } from "../../../../../../features/session-switcher/use-session-digest.ts"
import { useSessionRows } from "../../../../../../features/session-switcher/use-session-row-list.ts"
import { useSessionSelection } from "../../../../../../features/session-switcher/use-session-selection.ts"
import { useSessionSwitch } from "../../../../../../features/session-switcher/use-session-switch.ts"
import { useSessionSwitcherRequest } from "../../../../../../stores/session-switcher-request.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import { useOutlineSide, type OutlineSide } from "../../../stores/outline-side.ts"
import { sessionOutline, type SessionOutlineSection } from "../domain/session-outline-row.ts"
import { useReportOutlineTurns } from "./use-report-outline-turn-list.ts"
import { useSessionDetailPop, type SessionDetailPop } from "./use-session-detail-pop.ts"

/** 開いている詳細。 */
export type SessionDetailModel = {
  readonly row: SessionSwitcherRow
  readonly digest: SessionDigestView
  readonly characterName: string
  readonly faceUrl?: string
  readonly blocked: boolean
  readonly blockedTitle?: string
  readonly onSwitch: () => void
  readonly onClose: () => void
}

export type SessionOutlineModel = {
  readonly side: OutlineSide
  readonly onSelectSide: (side: OutlineSide) => void
  readonly sections: readonly SessionOutlineSection[]
  readonly count: number
  /** 詳細を開いている行の鍵。開いていないあいだは空。 */
  readonly selectedKey: string
  readonly onSelectRow: (key: string) => void
  /** 開いている詳細。開いていないあいだは無い。 */
  readonly detail?: SessionDetailModel
  /** 開いている詳細の行を、使用中を飛ばして前後へ動かす。 */
  readonly onMove: (step: number) => void
  readonly pop: SessionDetailPop
  readonly onOpenSwitcher: () => void
}

/** `collapsed` は札を畳んでいるか。畳むと詳細も閉じる。 */
export function useSessionOutline(collapsed: boolean): SessionOutlineModel {
  const side = useOutlineSide((state) => state.side)
  const shownAt = useOutlineSide((state) => state.shownAt)
  const selectSide = useOutlineSide((state) => state.selectSide)
  const firstTurnTitle = useReportOutlineTurns()[0]?.title
  const [mountedAt] = useState(nowEpochMilliseconds)
  const { rows, shortIds, currentSessionId } = useSessionRows(
    side === "sessions",
    shownAt ?? mountedAt,
  )
  const switcherOpen = useSessionSwitcherRequest((state) => state.open)
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)
  const character = useSession((session) => session.state.character)
  const switching = useSessionSwitch(rows)
  const [detailOpen, setDetailOpen] = useState(false)
  const { sections, count, detailRows } = sessionOutline({
    rows,
    currentSessionId,
    firstTurnTitle,
    currentShortId: currentSessionId === undefined ? undefined : shortIds.get(currentSessionId),
  })
  const selection = useSessionSelection(detailRows)

  const detailVisible = side === "sessions" && !collapsed && !switcherOpen
  if (detailOpen && !detailVisible) {
    setDetailOpen(false)
  }
  const opened = detailOpen && detailVisible ? selection.selected : undefined
  const face = characterFaceInfo(character)
  const pop = useSessionDetailPop(opened !== undefined, opened?.sessionId ?? "")

  return {
    side,
    onSelectSide: (next) => {
      selectSide(next, nowEpochMilliseconds())
    },
    sections,
    count,
    selectedKey: opened?.sessionId ?? "",
    onSelectRow: (key) => {
      if (opened?.sessionId === key) {
        setDetailOpen(false)
        return
      }
      const target = detailRows.find((row) => row.sessionId === key)
      if (target !== undefined) {
        selection.select(target.sessionId)
        setDetailOpen(true)
      }
    },
    ...(opened !== undefined && {
      detail: {
        row: opened,
        digest: selection.digest,
        characterName: face.alt,
        ...(face.url !== undefined && { faceUrl: face.url }),
        blocked: switching.blocked,
        blockedTitle: switching.blockedTitle,
        onSwitch: () => {
          switching.switchSession(opened.sessionId, () => {
            setDetailOpen(false)
          })
        },
        onClose: () => {
          setDetailOpen(false)
        },
      },
    }),
    onMove: selection.move,
    pop,
    onOpenSwitcher: () => {
      openSwitcher(nowEpochMilliseconds())
    },
  }
}
