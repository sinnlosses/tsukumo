// `<PendingAnswer>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 答え待ちの先頭（`state.pending[0]`）を読み、**許可要求を置くだけの値と送り先に畳む**。
//
// **質問はここに出ない**。質問の札はメインビュー
// （`components/page/conversation/main-view/question-ask.tsx`）へ移り、自由入力は `<Composer>` が担う。
// 組み立て中の答えを持つのは `stores/question-answer.tsx`。

import { summarizeToolInput } from "../../../../../lib/tool-summary.ts"
import { useSessionDispatch, useSessionSelector } from "../../../../../stores/session.tsx"

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

export function usePendingAnswer(): PendingAnswerModel {
  const pending = useSessionSelector((session) => session.state.pending[0])
  const dispatch = useSessionDispatch()

  if (pending === undefined || pending.kind !== "permission") {
    return { kind: "none" }
  }

  const summary = summarizeToolInput(pending.toolName, pending.input)
  return {
    kind: "permission",
    toolName: pending.toolName,
    summaryText: summary === "" ? "" : `: ${summary}`,
    onAllow: () => {
      dispatch.session.answer({ id: pending.id, answer: { kind: "allow" } })
    },
    onDeny: () => {
      dispatch.session.answer({ id: pending.id, answer: { kind: "deny" } })
    },
  }
}
