// 進み具合のプログレスバーの「手順」で開く全体の詳細の、並べる項目を組む決まり。
// 済んだフェーズが多ければ1行に畳み、まだのフェーズは3つまで見せて残りを数で言い、今のフェーズは走っている手順と直前の手順だけを出す。

import { formatMeasured } from "../../../../../../../shared/utils/elapsed-time.ts"
import type { CurrentWorkStepGroup } from "../../../../../../features/current-work/current-work-step.ts"
import type { StepsLanding } from "../../../stores/work-strip-step-list.ts"
import { lastStepsOf } from "./phase-detail.ts"
import type { StepsPhaseRow } from "./steps-phase-row.ts"

/** 済んだフェーズをこの数以上持つ作業中は、1行に畳む。 */
const FOLD_DONE_FROM = 3

/** まだのフェーズを見せる数の上限。 */
const UPCOMING_SHOWN = 3

/** 今のフェーズの行に出す、走っている手順と直前の手順の数。 */
const RECENT_STEP_COUNT = 2

/**
 * 全体の詳細に並べる項目。
 * `done-fold` は畳んだ済みのフェーズの1行（`total` は全部測れたときの計の所要、無ければ空）、
 * `phase` はフェーズの行（`groups` は出す手順、`hiddenStepCount` は隠した手順の数、`open` は「手順 n」を開いて出すか。開くのは失敗した手順へ着地するときの、失敗した手順を持つフェーズだけ）、
 * `upcoming-rest` は見せなかったまだのフェーズの数。
 */
export type StepsPlanItem =
  | { readonly kind: "done-fold"; readonly count: number; readonly total: string }
  | {
      readonly kind: "phase"
      readonly row: StepsPhaseRow
      readonly groups: readonly CurrentWorkStepGroup[]
      readonly hiddenStepCount: number
      readonly open: boolean
    }
  | { readonly kind: "upcoming-rest"; readonly count: number }

export type StepsPlanSource = {
  readonly rows: readonly StepsPhaseRow[]
  /** 完了したあとの姿。畳まず全行を並べる。 */
  readonly finished: boolean
  readonly landing: StepsLanding
  /** 「済んだ n フェーズ」を開いたか。 */
  readonly doneExpanded: boolean
  /** 今のフェーズの手順を全部開いたか。 */
  readonly stepsExpanded: boolean
}

export function stepsPlanCardOf(source: StepsPlanSource): readonly StepsPlanItem[] {
  const { rows, finished, stepsExpanded } = source
  const done = rows.filter((row) => row.state === "done")
  const folded = !finished && done.length >= FOLD_DONE_FROM && !isDoneOpened(source, done)
  const items: StepsPlanItem[] = []
  const landsOn = (row: StepsPhaseRow): boolean =>
    source.landing.kind === "failure" && hasFailedStep(row)
  let upcomingSeen = 0
  for (const row of rows) {
    if (row.state === "done") {
      if (!folded) {
        items.push(phaseItemOf(row, row.groups, 0, landsOn(row)))
      } else if (!items.some((item) => item.kind === "done-fold")) {
        items.push({ kind: "done-fold", count: done.length, total: totalOf(done) })
      }
    } else if (row.state === "upcoming") {
      upcomingSeen += 1
      if (finished || upcomingSeen <= UPCOMING_SHOWN) {
        items.push(phaseItemOf(row, row.groups, 0, false))
      }
    } else {
      const showAll = stepsExpanded || landsOn(row)
      const shown = showAll ? row.groups : lastStepsOf(row.groups, RECENT_STEP_COUNT)
      items.push(phaseItemOf(row, shown, row.stepCount - stepCountOf(shown), landsOn(row)))
    }
  }
  if (!finished && upcomingSeen > UPCOMING_SHOWN) {
    items.push({ kind: "upcoming-rest", count: upcomingSeen - UPCOMING_SHOWN })
  }
  return items
}

function isDoneOpened(source: StepsPlanSource, done: readonly StepsPhaseRow[]): boolean {
  return source.doneExpanded || (source.landing.kind === "failure" && done.some(hasFailedStep))
}

function hasFailedStep(row: StepsPhaseRow): boolean {
  return row.groups.some((group) => group.steps.some((step) => step.failure.kind === "failed"))
}

function phaseItemOf(
  row: StepsPhaseRow,
  groups: readonly CurrentWorkStepGroup[],
  hiddenStepCount: number,
  open: boolean,
): StepsPlanItem {
  return { kind: "phase", row, groups, hiddenStepCount, open }
}

function stepCountOf(groups: readonly CurrentWorkStepGroup[]): number {
  return groups.reduce((sum, group) => sum + group.steps.length, 0)
}

function totalOf(done: readonly StepsPhaseRow[]): string {
  let milliseconds = 0
  for (const row of done) {
    if (row.measured.kind !== "known") {
      return ""
    }
    milliseconds += row.measured.milliseconds
  }
  return formatMeasured({ kind: "known", milliseconds })
}
