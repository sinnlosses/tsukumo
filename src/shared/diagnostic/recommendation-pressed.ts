// 始め方の札が押されたこと（`recommendation-pressed`）の足跡の形。
// 時刻と札の種類だけを持つ。タスクの ID も理由の文も持たない。

import { z } from "zod"

import { RECOMMENDATION_CARD_KINDS } from "../recommendation/recommendation-card.ts"

export const recommendationPressedFootprintSchema = z.object({
  flow: z.literal("recommendation-pressed"),
  /** 押された時刻（エポックミリ秒）。 */
  at: z.number(),
  kind: z.enum(RECOMMENDATION_CARD_KINDS),
})

/** 始め方の札が押されたこと。 */
export type RecommendationPressedFootprint = Readonly<
  z.infer<typeof recommendationPressedFootprintSchema>
>
