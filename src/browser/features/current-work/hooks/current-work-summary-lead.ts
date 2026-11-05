// 札の要約で、手順の要約より先に出すもの（日記を書いている・質問を待っている）を1つに畳む。

import type { DateKey } from "../../../../shared/diary/date-key.ts"
import type { DiaryWriting } from "../../../../shared/diary/diary.ts"
import type { PendingAsk } from "../../../../shared/session-driver/pending-ask.ts"
import type { CurrentWorkState } from "../current-work-state.ts"

type PendingQuestion = Extract<PendingAsk, { readonly kind: "question" }>

export type SummaryLead =
  | { readonly kind: "diary"; readonly date: DateKey }
  | { readonly kind: "question"; readonly ask: PendingQuestion }
  | { readonly kind: "none" }

export function summaryLeadOf(
  state: CurrentWorkState,
  pending: readonly PendingAsk[],
  diaryWriting: DiaryWriting,
): SummaryLead {
  if (state === "diary" && diaryWriting.kind === "writing") {
    return { kind: "diary", date: diaryWriting.date }
  }
  const [first] = pending
  if (state === "pending" && first?.kind === "question") {
    return { kind: "question", ask: first }
  }
  return { kind: "none" }
}

/**
 * 質問の要約。1問目の `header` をそのまま使う。
 * `AskUserQuestion` の入力の型（`node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts`）で「最大12字」と決まっているので、切り詰める必要が無い。
 * 2問以上あれば「ほか n問」を添える。
 */
export function questionSummaryLabel(pending: PendingQuestion): string | undefined {
  const [first, ...rest] = pending.questions
  if (first === undefined) {
    return undefined
  }
  return rest.length > 0 ? `${first.header} ほか${String(rest.length)}問` : first.header
}
