// 進み具合のプログレスバーの左側。状態の印の種類と、見出しと、作業中でない状態の一文を決める。

import type { StampedPendingAsk } from "../../../../../../../shared/session-driver/pending-ask.ts"
import type { WorkStripResult } from "../../../domain/turn-result-mark.ts"

/** 状態の印の形。点は差し色（答え待ちは琥珀）、四角は灰、✕ は赤、チェックは緑。 */
export type WorkStripMark = "dot" | "square" | "cross" | "check"

export type WorkStripStatus = {
  readonly mark: WorkStripMark
  readonly heading: string
  /** 見出しの右に添える一文。作業中・背景で作業中は、いまの手順の一文が別に置くので空。 */
  readonly statement: string
}

export type WorkStripStatusSource = {
  readonly result: WorkStripResult
  /** 今のフェーズの名前。ワークプランが無い・今のフェーズが無ければ空。 */
  readonly phaseName: string
  /** ワークプランが届いているか。 */
  readonly planned: boolean
  readonly pending: readonly StampedPendingAsk[]
  /** 失敗の理由の語。失敗でなければ空。 */
  readonly failureReason: string
}

const WORKING_HEADING = "作業中"

const FIXED_STATUS = {
  "awaiting-answer": { mark: "dot", heading: "返事を待っています" },
  stopped: { mark: "square", heading: "止めました" },
  failed: { mark: "cross", heading: "失敗しました" },
  done: { mark: "check", heading: "できました" },
} as const satisfies Record<
  Exclude<WorkStripResult, "working" | "background">,
  { readonly mark: WorkStripMark; readonly heading: string }
>

export function workStripStatusOf(source: WorkStripStatusSource): WorkStripStatus {
  const { result } = source
  if (result === "working" || result === "background") {
    return {
      mark: "dot",
      heading: source.planned && source.phaseName !== "" ? source.phaseName : WORKING_HEADING,
      statement: "",
    }
  }
  return { ...FIXED_STATUS[result], statement: statementOf(source) }
}

function statementOf(source: WorkStripStatusSource): string {
  switch (source.result) {
    case "awaiting-answer":
      return pendingCountText(source.pending)
    case "stopped":
      return source.phaseName === "" ? "" : `${source.phaseName}の途中`
    case "failed":
      return source.failureReason
    default:
      return ""
  }
}

/** 「質問 2件」「許可 1件」「質問 1件・許可 1件」。質問は1回の問いに含まれる質問の数で数える。 */
function pendingCountText(pending: readonly StampedPendingAsk[]): string {
  const questions = pending.reduce(
    (sum, ask) => sum + (ask.kind === "question" ? ask.questions.length : 0),
    0,
  )
  const permissions = pending.filter((ask) => ask.kind === "permission").length
  return [
    ...(questions > 0 ? [`質問 ${String(questions)}件`] : []),
    ...(permissions > 0 ? [`許可 ${String(permissions)}件`] : []),
  ].join("・")
}
