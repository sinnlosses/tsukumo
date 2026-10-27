// 版を比べる対の判定と、利用者の選択との一致率。
// 判定は左右を入れ替えて2回聞いた答えから決め、両方で同じ側が勝ったときだけその側の勝ちにする。

import { z } from "zod"

import type { PairSide } from "./variant-pair-page.ts"

/** 1回の問い合わせの答え。先に見せた画か、後に見せた画か。 */
export type JudgeAnswer = "first" | "second"

/** 対1つの判定。入れ替えで食い違ったら `tie`。 */
export type PairVerdict = PairSide | "tie"

/** 選択の JSON（`choices.json`）の形。`undecided` は選んでいない対。 */
export const choicesSchema = z.object({
  choices: z.record(z.string(), z.enum(["left", "right", "undecided"])),
})

export type PairChoices = z.infer<typeof choicesSchema>

/** 一致率。分母は利用者が左右を選んだ対で、判定の `tie` は一致に数えない。 */
export type PairAgreement = {
  readonly chosen: number
  readonly agreed: number
  readonly ties: number
  readonly rate: { readonly kind: "measured"; readonly value: number } | { readonly kind: "none" }
}

/**
 * `asked` は左を先・右を後に見せた答え、`swapped` は右を先・左を後に見せた答え。
 * 両方で同じ側が勝ったときだけ、その側を返す。
 */
export function verdictOf(asked: JudgeAnswer, swapped: JudgeAnswer): PairVerdict {
  const askedWinner: PairSide = asked === "first" ? "left" : "right"
  const swappedWinner: PairSide = swapped === "first" ? "right" : "left"
  return askedWinner === swappedWinner ? askedWinner : "tie"
}

/** 判定の無い対は一致に数えない。 */
export function agreementOf(
  choices: PairChoices,
  verdicts: Readonly<Record<string, PairVerdict>>,
): PairAgreement {
  const chosen = Object.entries(choices.choices).flatMap(([pairId, choice]) =>
    choice === "undecided" ? [] : [{ pairId, choice }],
  )
  const agreed = chosen.filter(({ pairId, choice }) => verdicts[pairId] === choice).length
  const ties = chosen.filter(({ pairId }) => verdicts[pairId] === "tie").length
  return {
    chosen: chosen.length,
    agreed,
    ties,
    rate:
      chosen.length === 0 ? { kind: "none" } : { kind: "measured", value: agreed / chosen.length },
  }
}
