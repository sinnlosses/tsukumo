// 狭い画面の「済んだ段」の一覧のロジック。
// どの行を板で開いているかを持ち、板の頭と下端に出す字（n/N・前後の行）を畳む。

import { useState } from "react"

import type { MainViewTurn } from "../../../../../../../../../shared/session/main-view.ts"
import {
  neighborRow,
  phaseRowsOf,
  phaseTotal,
  type PhaseNeighbor,
  type PhaseRow,
} from "../../../domain/phase-row.ts"

export type PhaseListProps = {
  readonly turn: MainViewTurn
  /** 見ているやり取りの段取りの段の数。段取りが無ければ 0。 */
  readonly planCount: number
}

/** 板の下端の前後のボタン1つ。端では `disabled`。 */
export type PhaseMove =
  | { readonly kind: "disabled" }
  | { readonly kind: "move"; readonly position: string; readonly row: PhaseRow }

/** 板で開いている行。 */
export type PhaseSheet =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly row: PhaseRow
      /** 「2/5」。 */
      readonly position: string
      readonly previous: PhaseMove
      readonly next: PhaseMove
    }

export type PhaseListModel = {
  readonly rows: readonly PhaseRow[]
  readonly sheet: PhaseSheet
  /** 行を押して開く。板の中の前後へ移るのも同じ(開く行を替える)。 */
  readonly onOpen: (row: PhaseRow) => void
  readonly onClose: () => void
}

type OpenStep = { readonly kind: "closed" } | { readonly kind: "open"; readonly stepId: number }

const CLOSED = { kind: "closed" } as const satisfies OpenStep

export function usePhaseList(props: PhaseListProps): PhaseListModel {
  const [opened, setOpened] = useState<OpenStep>(CLOSED)
  const rows = phaseRowsOf(props.turn)
  const total = phaseTotal(rows, props.planCount)
  const positionOf = (row: PhaseRow): string => `${String(row.number)}/${String(total)}`
  const moveOf = (neighbor: PhaseNeighbor): PhaseMove =>
    neighbor.kind === "row"
      ? { kind: "move", position: positionOf(neighbor.row), row: neighbor.row }
      : { kind: "disabled" }
  const current =
    opened.kind === "open" ? rows.find((row) => row.stepId === opened.stepId) : undefined

  return {
    rows,
    sheet:
      current === undefined
        ? CLOSED
        : {
            kind: "open",
            row: current,
            position: positionOf(current),
            previous: moveOf(neighborRow(rows, current.stepId, "previous")),
            next: moveOf(neighborRow(rows, current.stepId, "next")),
          },
    onOpen: (row) => {
      setOpened({ kind: "open", stepId: row.stepId })
    },
    onClose: () => {
      setOpened(CLOSED)
    },
  }
}
