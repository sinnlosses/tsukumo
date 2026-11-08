// 時刻の軸に行ごとの帯・延びた分・出来事を並べる `timeline` の塊の形。

import { z } from "zod"

import { partCardNote } from "./part-card-note.ts"
import { aside, type DeepReadonly, fold, inlineText, omittable } from "./report-block-field.ts"

const timeValue = z.union([z.string(), z.number()])

const timelineRowSchema = z.object({
  name: inlineText,
  start: timeValue,
  end: omittable(timeValue, ""),
  extra: partCardNote(omittable(timeValue.array(), []), "end より後へ延びた区切りの時刻"),
  uncertain: partCardNote(
    omittable(z.object({ until: timeValue, label: inlineText }), { until: "", label: "" }),
    "終わり（extra の最後）より後ろの止まりうる区間",
  ),
  after: partCardNote(omittable(inlineText.array(), []), "待つ行の name"),
  lane: partCardNote(omittable(inlineText, ""), "役ごとのまとまりの名前"),
})

export const timelineBlockSchema = z
  .object({
    kind: z.literal("timeline"),
    title: partCardNote(omittable(inlineText, ""), "数と向きで主張を言う1文。評価語なし"),
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
