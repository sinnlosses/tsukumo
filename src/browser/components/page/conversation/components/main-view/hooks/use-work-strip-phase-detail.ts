// 進み具合のプログレスバーの下線の区間を押すと重なって出る、フェーズの詳細のロジック。
// どの区間の詳細が開いているかは store が持つので、ここは今のやり取りで開いている区間の中身を組み、押した区間の下へ置く位置を測り、外・Esc での閉じを受ける。

import { type RefObject, useRef, useState } from "react"

import type { TurnStepList } from "../../../../../../../shared/session/turn-step.ts"
import {
  type DelegatedRange,
  type LatestWorkPlan,
  NO_DELEGATED_RANGE,
  phaseCount,
} from "../../../../../../../shared/session/work-plan.ts"
import { isTurnCounting, turnCountedUntil } from "../../../../../../domain/turn-elapsed.ts"
import { currentWorkStepGroups } from "../../../../../../features/current-work/current-work-step.ts"
import { useDismissSignal } from "../../../../../../hooks/use-dismiss-signal.ts"
import { useNowWhile } from "../../../../../../stores/clock.ts"
import { useCurrentTurnSteps } from "../../../../../../stores/current-turn-step-list.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { phaseRecapsOf } from "../../../domain/phase-recap.ts"
import { WHOLE_SEGMENT_KEY, workSegmentsOf } from "../../../domain/work-segment.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { useWorkStripSteps } from "../../../stores/work-strip-step-list.ts"
import { type PhaseDetail, phaseDetailOf } from "../domain/phase-detail.ts"
import { phaseRowSlotOf, stepsPhaseRowsOf } from "../domain/steps-phase-row.ts"

/** 詳細の面の幅の上限（CSS の `inline-size` と同じ値）。 */
const POP_WIDTH = 340

/** 面を帯の左右の端・ビューポートの端から離す幅。 */
const POP_EDGE_GAP = 8

/** 面を帯の下端から離す幅。 */
const POP_BELOW_GAP = 8

/** 面の置き場所。`left`・`top` は面を置く要素（区間の並びを持つ行）の左上からの px。 */
type PopPlace = { readonly left: number; readonly top: number }

type OpenPopup = {
  readonly kind: "open"
  readonly segmentKey: string
  readonly detail: PhaseDetail
}

export type WorkStripPhasePopup = { readonly kind: "closed" } | OpenPopup

export type WorkStripPhaseDetail = {
  /** 区間の並びと詳細の面を包む要素に付ける。外の `pointerdown` はこの要素の外で数える。 */
  readonly rootRef: RefObject<HTMLDivElement | null>
  /** 区間を押したとき。押した区間の下へ置く位置を測って、詳細を開閉する。 */
  readonly onSegmentPress: (segmentKey: string, button: HTMLElement) => void
  readonly popup: WorkStripPhasePopup
  readonly place: PopPlace
}

const CLOSED = { kind: "closed" } as const satisfies WorkStripPhasePopup

const START_PLACE = { left: 0, top: 0 } as const satisfies PopPlace

export function useWorkStripPhaseDetail(): WorkStripPhaseDetail {
  const turnStepList = useCurrentTurnSteps()
  const content = useMainViewContent((state) => state.content)
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const opened = useWorkStripSteps((state) => state.opened)
  const toggle = useWorkStripSteps((state) => state.toggle)
  const togglePhase = useWorkStripSteps((state) => state.togglePhase)
  const closePhase = useWorkStripSteps((state) => state.closePhase)
  const rootRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<PopPlace>(START_PLACE)
  const shown =
    content.kind !== "welcome" &&
    opened.kind === "phase" &&
    opened.exchange === content.exchange &&
    turnStepList.kind === "turn"
  const now = useNowWhile(isTurnCounting(turn, backgroundTasks.length))
  const popup: WorkStripPhasePopup = shown
    ? popupOf({
        turnStepList,
        segmentKey: opened.segmentKey,
        asking: content.kind === "work" && pending[0] !== undefined,
        finished: content.kind !== "work",
        countedUntil: turnCountedUntil(turn, backgroundTasks.length, now),
      })
    : CLOSED

  useDismissSignal({
    open: popup.kind === "open",
    rootRef,
    onDismiss: (cause) => {
      closePhase()
      if (cause === "escape" && popup.kind === "open") {
        rootRef.current
          ?.querySelector<HTMLElement>(`[data-segment-key="${popup.segmentKey}"]`)
          ?.focus()
      }
    },
  })

  const onSegmentPress = (segmentKey: string, button: HTMLElement): void => {
    if (content.kind === "welcome") {
      return
    }
    if (segmentKey === WHOLE_SEGMENT_KEY) {
      toggle(content.exchange)
      return
    }
    const strip = button.closest("section")
    const row = rootRef.current?.parentElement
    if (strip !== null && row !== null && row !== undefined) {
      setPlace(placeOf(strip.getBoundingClientRect(), row.getBoundingClientRect(), button))
    }
    togglePhase(content.exchange, segmentKey)
  }

  return { rootRef, onSegmentPress, popup, place }
}

/**
 * 押した区間の中央に面の中央を合わせ、帯の左右の端とビューポートの端から `POP_EDGE_GAP` の内に収める。上は帯の下端から `POP_BELOW_GAP`。
 * 面の幅は `min(POP_WIDTH, 帯の幅)`。
 */
function placeOf(strip: DOMRect, row: DOMRect, button: HTMLElement): PopPlace {
  const at = button.getBoundingClientRect()
  const width = Math.min(POP_WIDTH, strip.width)
  const wanted = at.left + at.width / 2 - width / 2
  const low = Math.max(strip.left, POP_EDGE_GAP)
  const high = Math.min(strip.right, window.innerWidth - POP_EDGE_GAP) - width
  const left = Math.min(Math.max(wanted, low), Math.max(high, low))
  return { left: left - row.left, top: strip.bottom + POP_BELOW_GAP - row.top }
}

function popupOf(input: {
  readonly turnStepList: Extract<TurnStepList, { readonly kind: "turn" }>
  readonly segmentKey: string
  readonly asking: boolean
  readonly finished: boolean
  readonly countedUntil: number
}): WorkStripPhasePopup {
  const { turnStepList, segmentKey } = input
  const { plan } = turnStepList
  const { segments } = workSegmentsOf(plan, { asking: input.asking, finished: input.finished })
  const index = segments.findIndex((candidate) => candidate.key === segmentKey)
  const segment = segments[index]
  if (segment === undefined) {
    return CLOSED
  }
  const recaps = phaseRecapsOf(turnStepList.trail, { kind: "stamped", at: input.countedUntil })
  const { rows } = stepsPhaseRowsOf(
    segments.map((each) => phaseRowSlotOf(each, recaps)),
    currentWorkStepGroups(turnStepList.steps),
  )
  return {
    kind: "open",
    segmentKey,
    detail: phaseDetailOf({
      segment,
      index,
      count: segments.length,
      previousState: segments[index - 1]?.state ?? "none",
      delegatedRange: delegatedRangeOf(plan),
      phaseTotal: plan.kind === "planned" ? phaseCount(plan.phases) : 0,
      recaps,
      rows,
    }),
  }
}

function delegatedRangeOf(plan: LatestWorkPlan): DelegatedRange {
  return plan.kind === "planned" ? plan.delegatedRange : NO_DELEGATED_RANGE
}
