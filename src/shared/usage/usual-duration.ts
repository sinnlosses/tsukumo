// 段の群ごと・待ちの種類ごとの「いつもは」の所要（秒）。見込みと止まって見えるときの言い方の材料。
// 運ぶのは件数と秒数だけ。

import { z } from "zod"

import { PHASE_SPANS, WAIT_KINDS } from "./experience-metric-record.ts"

/** 見込みと幅を出してよい件数の下限。これより少なければ `empty` にする。 */
export const USUAL_DURATION_MIN_COUNT = 5

/** 1つの塊の所要の広がり。件数が {@link USUAL_DURATION_MIN_COUNT} に足りなければ `empty`。 */
const usualSpreadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty"), count: z.number() }).readonly(),
  z
    .object({
      kind: z.literal("measured"),
      count: z.number(),
      medianSeconds: z.number(),
      /** 25 パーセンタイル（秒）。 */
      lowSeconds: z.number(),
      /** 75 パーセンタイル（秒）。 */
      highSeconds: z.number(),
    })
    .readonly(),
])

export type UsualSpread = z.infer<typeof usualSpreadSchema>

export const usualDurationsSchema = z
  .object({
    phases: z.record(z.enum(PHASE_SPANS), usualSpreadSchema),
    waits: z.record(z.enum(WAIT_KINDS), usualSpreadSchema),
  })
  .readonly()

export type UsualDurations = z.infer<typeof usualDurationsSchema>

const NO_SPREAD = { kind: "empty", count: 0 } as const satisfies UsualSpread

/** 記録がまだ1件も無い（取ってくる前・取れなかった）ときの値。 */
export const NO_USUAL_DURATIONS = {
  phases: { whole: NO_SPREAD, lead: NO_SPREAD, delegated: NO_SPREAD, trail: NO_SPREAD },
  waits: { bash: NO_SPREAD, agent: NO_SPREAD, workflow: NO_SPREAD, other: NO_SPREAD },
} as const satisfies UsualDurations
