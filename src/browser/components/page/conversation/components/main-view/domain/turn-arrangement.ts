// やり取り1件の札の中の並び。
// 最終レポートのある閉じたやり取りだけ、最終レポートを先に出し、中間レポートと質問の記録を経過の畳みにまとめる。
// それ以外（働くあいだ・最終レポートの無いまま閉じたやり取り）は届いた順のまま。

import { sum } from "remeda"

import {
  isInterimStep,
  type MainViewAction,
  type MainViewAside,
  type MainViewPhaseLabel,
  type MainViewQuestion,
  type MainViewStep,
  type MainViewTurn,
} from "../../../../../../../shared/session/main-view-shape.ts"
import {
  formatMeasured,
  type MeasuredTime,
} from "../../../../../../../shared/utils/elapsed-time.ts"

/** 経過の畳みの中の1件。中間レポートのステップか、質問の記録か、やり取り全体の補足メッセージ（末尾に1項だけ）。 */
export type ProgressEntry =
  | { readonly kind: "interim"; readonly step: MainViewStep }
  | { readonly kind: "question"; readonly entry: MainViewQuestion }
  | { readonly kind: "asides"; readonly asides: readonly MainViewAside[] }

/**
 * 札の中の並び。補足メッセージはどちらも、やり取りの全ステップ分を送った順に1つへまとめる。
 * - `arrival`: `turn.steps` を届いた順に出し、`asides` は札の中身のいちばん下に1つの欄で出す
 * - `final-first`: 最終レポート → 経過の畳み（`progress`。届いた順で、末尾に補足メッセージの項。空なら畳みを出さない）
 */
type TurnArrangement =
  | { readonly kind: "arrival"; readonly asides: readonly MainViewAside[] }
  | {
      readonly kind: "final-first"
      readonly final: MainViewStep
      readonly progress: readonly ProgressEntry[]
    }

/** 最終レポートの印（`MainViewStep.mark` が `final`）の付いたステップがあるときだけ `final-first` にする。 */
export function arrangeTurn(turn: MainViewTurn): TurnArrangement {
  const asides = turn.steps.flatMap((step) => step.asides)
  const final = turn.steps.find((step) => step.mark === "final")
  if (final === undefined) {
    return { kind: "arrival", asides }
  }
  const asidesEntry: readonly ProgressEntry[] =
    asides.length > 0 ? [{ kind: "asides", asides }] : []
  return {
    kind: "final-first",
    final,
    progress: [...turn.steps.flatMap(progressOf), ...asidesEntry],
  }
}

/**
 * 経過の畳みの `<summary>` に出す字。
 * 件数は中間レポートの数で、質問の記録があれば「 · 質問 <m> 件」、補足メッセージがあれば「 · 補足 <k> 件」を足す。
 * 段のまとめがあれば「 · 所要 <合計>（<段> <所要> · …）」を添える。
 * 測れなかった段が1つでもあれば合計は出さない。
 */
export function progressFoldSummary(progress: readonly ProgressEntry[]): string {
  const interims = progress.flatMap((entry) => (entry.kind === "interim" ? [entry.step] : []))
  const questionCount = progress.filter((entry) => entry.kind === "question").length
  const asideCount = sum(
    progress.map((entry) => (entry.kind === "asides" ? entry.asides.length : 0)),
  )
  const head = `経過 ${String(interims.length)} 件${questionCount > 0 ? ` · 質問 ${String(questionCount)} 件` : ""}${asideCount > 0 ? ` · 補足 ${String(asideCount)} 件` : ""}`
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

/** ステップごとに、中間レポートの本文、続けてそのステップの質問の記録の順に並べる。 */
function progressOf(step: MainViewStep): readonly ProgressEntry[] {
  const interim: readonly ProgressEntry[] =
    isInterimStep(step) && step.body.kind === "text" ? [{ kind: "interim", step }] : []
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
