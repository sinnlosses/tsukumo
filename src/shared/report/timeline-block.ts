// 時刻の軸に行ごとの帯・延びた分・出来事を並べる `timeline` の塊の形。

import { z } from "zod"

import { aside, type DeepReadonly, fold, inlineText, omittable } from "./report-block-field.ts"

const timeValue = z.union([z.string(), z.number()])

const timelineRowSchema = z.object({
  name: inlineText.describe("項目名"),
  start: timeValue,
  end: omittable(timeValue, "").describe("省くと start の一点"),
  extra: omittable(timeValue.array(), []).describe(
    "差し戻しなどで end より後へ延びた区切りの時刻（昇順。往復2回なら2つ）",
  ),
  lane: omittable(inlineText, "").describe("役ごとのまとまりの名前"),
})

export const timelineBlockSchema = z
  .object({
    kind: z.literal("timeline"),
    title: omittable(inlineText, "").describe("数と向きで主張を言う1文。評価語なし"),
    rows: z
      .array(timelineRowSchema)
      .min(1)
      .describe(
        "時刻は HH:MM・ISO の日時・分の数のどれかで、1つの塊の中で混ぜない。日をまたぐなら ISO。同じ lane の中は start の昇順",
      ),
    events: omittable(z.array(z.object({ at: timeValue, label: inlineText })), []).describe(
      "割り込みなどの出来事（at の昇順）",
    ),
    emphasis: omittable(inlineText.array(), []).describe("差し色にする行の name"),
    fold,
    aside,
  })
  .describe(
    "いつ何が起き、どれだけ掛かり、どこで延びたか。目盛り・色・幅は tsukumo が決める。延び・出来事・一点のどれも無く、項目ごとの区間の長さを比べるだけなら chart の span",
  )

export type ReportTimeline = DeepReadonly<z.infer<typeof timelineBlockSchema>>
