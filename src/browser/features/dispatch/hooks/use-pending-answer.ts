// `<PendingAnswer>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 答え待ちの先頭（`state.pending[0]`）を読み、**許可要求は置くだけの値と送り先に畳み**、質問は
// そのまま `<QuestionAsk>` へ渡す形にして返す。
//
// **質問の選択の状態はここに持たない。** 持つのは `hooks/use-question-ask.ts` で、`<QuestionAsk>` が
// 出ている間だけ生きる（許可要求から質問へ切り替わったとき、前の選択を引きずらないため）。

import { type PendingAsk } from "../../../../shared/pending-ask.ts"
import { summarizeToolInput } from "../../../lib/tool-summary.ts"
import { useSessionDispatch, useSessionSelector } from "../../../stores/session.tsx"

/** `<PendingAnswer>` が画面に出す形。presenter は `kind` で出し分けて置くだけ。 */
export type PendingAnswerModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "permission"
      readonly toolName: string
      /** ツール名の後ろに続ける要約（`": <要約>"`）。要約が空なら空文字。 */
      readonly summaryText: string
      readonly onAllow: () => void
      readonly onDeny: () => void
    }
  | {
      readonly kind: "question"
      readonly pending: Extract<PendingAsk, { readonly kind: "question" }>
    }

export function usePendingAnswer(): PendingAnswerModel {
  const pending = useSessionSelector((session) => session.state.pending[0])
  const dispatch = useSessionDispatch()

  if (pending === undefined) {
    return { kind: "none" }
  }
  if (pending.kind === "question") {
    return { kind: "question", pending }
  }

  const summary = summarizeToolInput(pending.toolName, pending.input)
  return {
    kind: "permission",
    toolName: pending.toolName,
    summaryText: summary === "" ? "" : `: ${summary}`,
    onAllow: () => {
      dispatch({ type: "answer", id: pending.id, answer: { kind: "allow" } })
    },
    onDeny: () => {
      dispatch({ type: "answer", id: pending.id, answer: { kind: "deny" } })
    },
  }
}
