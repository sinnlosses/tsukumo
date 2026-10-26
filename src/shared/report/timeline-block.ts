// 時刻の軸に行ごとの帯・延びた分・出来事を並べる `timeline` の塊の形。

import { z } from "zod"

import { aside, type DeepReadonly, fold, inlineText, omittable } from "./report-block-field.ts"

const timeValue = z.union([z.string(), z.number()])

const timelineRowSchema = z.object({
  name: inlineText.describe("項目名"),
  start: timeValue,
  end: omittable(timeValue, "").describe("省くと start の一点"),
  extra: omittable(timeValue.array(), []).describe("end より後へ延びた区切りの時刻"),
  lane: omittable(inlineText, "").describe("役ごとのまとまりの名前"),
})

export const timelineBlockSchema = z
  .object({
    kind: z.literal("timeline"),
    title: omittable(inlineText, "").describe("数と向きで主張を言う1文。評価語なし"),
    rows: z.array(timelineRowSchema).min(1),
    events: omittable(z.array(z.object({ at: timeValue, label: inlineText })), []),
    emphasis: omittable(inlineText.array(), []),
    fold,
    aside,
  })
  .describe(
    "いつ何が起き、どれだけ掛かり、どこで延びたか（時刻つきの行の並び）。区間の長さを比べるだけなら chart の span",
  )

export type ReportTimeline = DeepReadonly<z.infer<typeof timelineBlockSchema>>
