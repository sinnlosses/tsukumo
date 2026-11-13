// 答え待ちの問いを、生まれた段の行に出す1件にする。

import type { StampedPendingAsk } from "../../../../../shared/session-driver/pending-ask.ts"

/**
 * 段の行が持つ問い。`question` は入力欄の問いと同じ文、`material` は材料（添え書きの事実の先頭1件、無ければ訊く理由、それも無ければ空）。
 * 答える場所は入力欄だけなので、答えは持たない。
 */
export type WorkPlanAsk =
  | { readonly kind: "none" }
  | {
      readonly kind: "asked"
      readonly question: string
      readonly material: string
      readonly askedAt: number
    }

export const NO_ASK = { kind: "none" } as const satisfies WorkPlanAsk

/** 答え待ちの最初の質問（許可要求は出さない）。質問が無ければ `none`。 */
export function askOf(asks: readonly StampedPendingAsk[]): WorkPlanAsk {
  const ask = asks.find((candidate) => candidate.kind === "question")
  const question = ask?.questions[0]
  if (ask === undefined || question === undefined) {
    return NO_ASK
  }
  const brief = ask.briefs.find((candidate) => candidate.header === question.header)
  return {
    kind: "asked",
    question: question.text,
    material: brief?.facts[0]?.text ?? brief?.whyAsk ?? "",
    askedAt: ask.askedAt,
  }
}
