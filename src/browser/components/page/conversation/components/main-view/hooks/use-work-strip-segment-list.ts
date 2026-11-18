// 進み具合のプログレスバーの下線のロジック。区間の並びと位置に、隠れていたあいだに済んだ区間の印と、済んだ瞬間の光の印を足す。
// 光は「前の描画より済んだ区間の数が増えた」描画の区間にだけ付け、付け直しや再読み込みの最初の描画では付けない。

import { useState } from "react"

import { useCurrentTurnSteps } from "../../../../../../stores/current-turn-step-list.ts"
import { useMainViewTurns } from "../../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../../stores/session.ts"
import {
  workSegmentsOf,
  type WorkStripPosition,
  type WorkStripSegment,
} from "../../../domain/work-segment.ts"
import { useAwaySeam } from "../../../stores/away-seam.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"

/** 区間1つの描画の元。 */
export type WorkStripSegmentView = WorkStripSegment & {
  /** ページが隠れていたあいだに済んだ区間（濃い差し色で残す）。 */
  readonly unseen: boolean
  /** 今から済んだに変わった描画の区間（一度だけ光る）。 */
  readonly landing: boolean
}

export type WorkStripSegmentsModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly segments: readonly WorkStripSegmentView[]
      readonly position: WorkStripPosition
      /** 光の動きが終わったとき、その区間の `landing` を外す。 */
      readonly onLanded: (key: string) => void
    }

type Seen =
  | { readonly kind: "none" }
  | { readonly kind: "counted"; readonly done: number; readonly landing: readonly string[] }

const NONE = { kind: "none" } as const

export function useWorkStripSegmentList(): WorkStripSegmentsModel {
  const turnStepList = useCurrentTurnSteps()
  const content = useMainViewContent((state) => state.content)
  const pending = useSession((session) => session.state.pending)
  const generation = useSession((session) => session.generation)
  const newestTurnId = useMainViewTurns().at(-1)?.id
  const away = useAwaySeam((state) => state.away)
  const [seen, setSeen] = useState<Seen>(NONE)

  if (content.kind === "welcome" || turnStepList.kind !== "turn") {
    return NONE
  }
  const working = content.kind === "work"
  const { segments, position } = workSegmentsOf(turnStepList.plan, {
    asking: working && pending[0] !== undefined,
    finished: !working,
  })
  const doneCount = segments.filter((segment) => segment.state === "done").length
  const keys = segments.map((segment) => segment.key)

  let landing: readonly string[] = seen.kind === "counted" ? seen.landing : []
  if (seen.kind === "none" || doneCount < seen.done) {
    setSeen({ kind: "counted", done: doneCount, landing: [] })
    landing = []
  } else if (doneCount > seen.done) {
    landing = [...seen.landing, ...keys.slice(seen.done, doneCount)]
    setSeen({ kind: "counted", done: doneCount, landing })
  }

  const awayHere =
    away?.generation === generation &&
    away.turnId === newestTurnId &&
    doneCount <= away.visibleDoneSegments
      ? away
      : undefined
  return {
    kind: "shown",
    position,
    segments: segments.map((segment, index) => ({
      ...segment,
      unseen:
        awayHere !== undefined &&
        awayHere.hiddenDoneSegments <= index &&
        index < awayHere.visibleDoneSegments,
      landing: landing.includes(segment.key),
    })),
    onLanded: (key) => {
      setSeen((previous) =>
        previous.kind === "counted"
          ? { ...previous, landing: previous.landing.filter((landed) => landed !== key) }
          : previous,
      )
    },
  }
}
