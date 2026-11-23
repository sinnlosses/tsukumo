// ワークフロースクリプトの図の両端に置く、メインの「着手」と「送り出し」の手順の数と所要を、依頼の手順から引く。

import type { TurnStep } from "../../../../../../../shared/session/turn-step.ts"
import { toolDuration } from "../../../../../../../shared/session/turn-step.ts"
import type { MeasuredTime } from "../../../../../../../shared/utils/elapsed-time.ts"

const WORKFLOW_TOOL_NAME = "Workflow"

/** メインの手順のまとまり。`count` は手順の数、`duration` は測れた手順の所要の合計（1件も測れなければ不明）。 */
export type WorkflowMainStepSpan = {
  readonly count: number
  readonly duration: MeasuredTime
}

/** ワークフロースクリプト1本ぶんの両端。`landing` は最後のワークフロースクリプトだけが持ち、ほかは手順が無い。 */
export type WorkflowMainStepEnds = {
  readonly prelude: WorkflowMainStepSpan
  readonly landing: WorkflowMainStepSpan
}

const EMPTY_SPAN = {
  count: 0,
  duration: { kind: "unknown" },
} as const satisfies WorkflowMainStepSpan

/**
 * `runCount` 本のワークフロースクリプト（起こした順）それぞれの着手と送り出しのメインの手順を引く。
 * `steps` は古い順の依頼の手順で、サブエージェントの中の手順は数えない。
 * n 本目の着手は、n−1 本目の `Workflow` の呼び出しの次（最初は依頼の始まり）から n 本目の `Workflow` の呼び出しまで。
 * 送り出しは最後の `Workflow` の呼び出しより後ろで、`landingFrom`（委譲の範囲の次の段の位置）以降の段で始まった手順だけ。
 * `landingFrom` が無ければ（範囲の後ろに段が無い・範囲が未確定）送り出しは無い。呼び出しが見つからないスクリプトは着手が無い。
 */
export function workflowMainStepEndsOf(
  steps: readonly TurnStep[],
  runCount: number,
  landingFrom?: number,
): readonly WorkflowMainStepEnds[] {
  const main = steps.filter((step) => !step.nested)
  const callPositions = main.flatMap((step, position) =>
    step.name === WORKFLOW_TOOL_NAME ? [position] : [],
  )
  return Array.from({ length: runCount }, (_unused, run): WorkflowMainStepEnds => {
    const call = callPositions[run]
    if (call === undefined) {
      return { prelude: EMPTY_SPAN, landing: EMPTY_SPAN }
    }
    const previous = callPositions[run - 1]
    const isLast = run === callPositions.length - 1
    return {
      prelude: spanOf(main.slice(previous === undefined ? 0 : previous + 1, call + 1)),
      landing:
        isLast && landingFrom !== undefined
          ? spanOf(main.slice(call + 1).filter((step) => startsFrom(step, landingFrom)))
          : EMPTY_SPAN,
    }
  })
}

function startsFrom(step: TurnStep, landingFrom: number): boolean {
  return step.phase.kind === "phase" && step.phase.indexes.every((index) => index >= landingFrom)
}

function spanOf(steps: readonly TurnStep[]): WorkflowMainStepSpan {
  const known = steps.flatMap((step) => {
    const duration = toolDuration(step)
    return duration.kind === "known" ? [duration.milliseconds] : []
  })
  return {
    count: steps.length,
    duration:
      known.length === 0
        ? { kind: "unknown" }
        : { kind: "known", milliseconds: known.reduce((sum, value) => sum + value, 0) },
  }
}
