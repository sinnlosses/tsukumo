// やり取り1件の札の中の並び。
// 最終レポートのある閉じたやり取りだけ、最終レポートを先に出し、中間レポートを経過の畳みにまとめる。
// それ以外（働くあいだ・最終レポートの無いまま閉じたやり取り）は届いた順のまま。

import { sum } from "remeda"

import type {
  MainViewAction,
  MainViewAside,
  MainViewPhaseLabel,
  MainViewQuestion,
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../shared/session/main-view-shape.ts"
import {
  formatMeasured,
  type MeasuredTime,
} from "../../../../../../../shared/utils/elapsed-time.ts"

/** 最終レポートの直後・経過の畳みの前に、送った順で出すもの。`stepId` は持ち主のステップ（描く側の `key`）。 */
export type TurnBeside =
  | { readonly kind: "question"; readonly entry: MainViewQuestion }
  | {
      readonly kind: "asides"
      readonly stepId: number
      readonly asides: readonly MainViewAside[]
    }

/**
 * 札の中の並び。
 * - `arrival`: `turn.steps` を届いた順に出す
 * - `final-first`: 最終レポート → `besides` → 経過の畳み（`progress`。空なら畳みを出さない）
 */
type TurnArrangement =
  | { readonly kind: "arrival" }
  | {
      readonly kind: "final-first"
      readonly final: MainViewStep
      readonly besides: readonly TurnBeside[]
      readonly progress: readonly MainViewStep[]
    }

const ARRIVAL = { kind: "arrival" } as const satisfies TurnArrangement

/** 最終レポートの印（`MainViewStep.final`）が立ったステップがあるときだけ `final-first` にする。 */
export function arrangeTurn(turn: MainViewTurn): TurnArrangement {
  const final = turn.steps.find((step) => step.final)
  if (final === undefined) {
    return ARRIVAL
  }
  return {
    kind: "final-first",
    final,
    besides: turn.steps.flatMap((step) => besidesOf(step, step.id === final.id)),
    progress: turn.steps.filter((step) => step.interim && step.body.kind === "text"),
  }
}

/**
 * 経過の畳みの `<summary>` に出す字。
 * 段のまとめがあれば「 · 所要 <合計>（<段> <所要> · …）」を添える。
 * 測れなかった段が1つでもあれば合計は出さない。
 */
export function progressFoldSummary(progress: readonly MainViewStep[]): string {
  const head = `経過 ${String(progress.length)} 件`
  const phases = progress.flatMap(phaseOf)
  if (phases.length === 0) {
    return head
  }
  const total = totalOf(phases.map((phase) => phase.duration))
  const list = phases
    .map(
      (phase) =>
        `${phase.label}${phase.skipped ? " 飛ばした" : ""} ${formatMeasured(phase.duration)}`,
    )
    .join(" · ")
  return `${head}${total.kind === "known" ? ` · 所要 ${formatMeasured(total)}` : ""}（${list}）`
}

/** 最終のステップの質問の記録は最終の札の中に出すので、ここには脇の話だけを入れる。 */
function besidesOf(step: MainViewStep, final: boolean): readonly TurnBeside[] {
  const questions = final
    ? []
    : step.actions.filter(isQuestion).map((entry): TurnBeside => ({ kind: "question", entry }))
  const asides: readonly TurnBeside[] =
    step.asides.length > 0 ? [{ kind: "asides", stepId: step.id, asides: step.asides }] : []
  return [...questions, ...asides]
}

function phaseOf(step: MainViewStep): readonly Extract<MainViewPhaseLabel, { kind: "phase" }>[] {
  return step.body.kind === "text" && step.body.finishedPhase.kind === "phase"
    ? [step.body.finishedPhase]
    : []
}

function totalOf(durations: readonly MeasuredTime[]): MeasuredTime {
  const known = durations.flatMap((duration) =>
    duration.kind === "known" ? [duration.milliseconds] : [],
  )
  return known.length === durations.length
    ? { kind: "known", milliseconds: sum(known) }
    : { kind: "unknown" }
}

function isQuestion(action: MainViewAction): action is MainViewQuestion {
  return action.kind === "question"
}
