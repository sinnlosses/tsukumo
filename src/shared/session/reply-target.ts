// 返す層の「聞く」が指した所（レポートの部品や表の行）。

import { z } from "zod"

/** 指した所の添字などの上限。素朴な上限であって、秘匿・検閲のためではない。 */
const MAX_REPLY_TARGET_LABEL_LENGTH = 500

const labelPart = z.string().min(1).max(MAX_REPLY_TARGET_LABEL_LENGTH)

/**
 * 指した所の字（Claude へ渡す）。
 * `component` は部品の題（無ければ部品の種類の名前）、`row` は行を指したときだけ。図表番号は入れない。
 */
const replyTargetLabelSchema = z.object({
  section: labelPart.optional(),
  component: labelPart,
  row: labelPart.optional(),
})

/** 指した所の鍵（ブラウザが答えを戻す先。Claude へは渡さない）。`rowIndex` は書き手が書いた並びでの添字。 */
export const replyTargetKeySchema = z.object({
  reportToolUseId: z.string().min(1),
  componentId: z.string().min(1),
  rowIndex: z.number().int().nonnegative().optional(),
})

export const replyTargetSchema = z.object({
  label: replyTargetLabelSchema,
  key: replyTargetKeySchema,
})

export type ReplyTargetKey = z.infer<typeof replyTargetKeySchema>

export type ReplyTarget = z.infer<typeof replyTargetSchema>

export function sameReplyKey(a: ReplyTargetKey, b: ReplyTargetKey): boolean {
  return (
    a.reportToolUseId === b.reportToolUseId &&
    a.componentId === b.componentId &&
    a.rowIndex === b.rowIndex
  )
}
