// やり取り1件の札の中の並び。
// 最終レポートのある閉じたやり取りだけ、最終レポートを先に出し、中間レポートと質問の記録を経過の畳みにまとめる。
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
export type TurnBeside = {
  readonly kind: "asides"
  readonly stepId: number
  readonly asides: readonly MainViewAside[]
}

/** 経過の畳みの中の1件。中間レポートのステップか、質問の記録。 */
export type ProgressEntry =
  | { readonly kind: "interim"; readonly step: MainViewStep }
  | { readonly kind: "question"; readonly entry: MainViewQuestion }

/**
 * 札の中の並び。
 * - `arrival`: `turn.steps` を届いた順に出す
 * - `final-first`: 最終レポート → `besides` → 経過の畳み（`progress`。届いた順で、空なら畳みを出さない）
 */
type TurnArrangement =
  | { readonly kind: "arrival" }
  | {
      readonly kind: "final-first"
      readonly final: MainViewStep
      readonly besides: readonly TurnBeside[]
      readonly progress: readonly ProgressEntry[]
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
    besides: turn.steps.flatMap(besidesOf),
    progress: turn.steps.flatMap(progressOf),
  }
}

/**
 * 経過の畳みの `<summary>` に出す字。
 * 件数は中間レポートの数で、質問の記録があれば「 · 質問 <m> 件」を足す。
 * 段のまとめがあれば「 · 所要 <合計>（<段> <所要> · …）」を添える。
 * 測れなかった段が1つでもあれば合計は出さない。
 */
export function progressFoldSummary(progress: readonly ProgressEntry[]): string {
  const interims = progress.flatMap((entry) => (entry.kind === "interim" ? [entry.step] : []))
  const questionCount = progress.length - interims.length
  const head = `経過 ${String(interims.length)} 件${questionCount > 0 ? ` · 質問 ${String(questionCount)} 件` : ""}`
  const phases = interims.flatMap(phaseOf)
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

function besidesOf(step: MainViewStep): readonly TurnBeside[] {
  return step.asides.length > 0 ? [{ kind: "asides", stepId: step.id, asides: step.asides }] : []
}

/** ステップごとに、中間レポートの本文、続けてそのステップの質問の記録の順に並べる。 */
function progressOf(step: MainViewStep): readonly ProgressEntry[] {
  const interim: readonly ProgressEntry[] =
    step.interim && step.body.kind === "text" ? [{ kind: "interim", step }] : []
  const questions = step.actions
    .filter(isQuestion)
    .map((entry): ProgressEntry => ({ kind: "question", entry }))
  return [...interim, ...questions]
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
