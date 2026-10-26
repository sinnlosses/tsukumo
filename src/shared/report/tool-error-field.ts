import { z } from "zod"

/**
 * 形の検査で落ちた `report` の呼び出しの、落ちた欄の1つ。
 * `field` は zod の `issues[].path` を `.` でつなぎ、配列の添字を `n` に畳んだもの（`sections.n.blocks.n.kind`）。
 * `code` は zod の `issues[].code`。メッセージと値は持たない。
 */
export const toolErrorFieldSchema = z
  .object({
    field: z.string(),
    code: z.string(),
  })
  .readonly()

export type ToolErrorField = z.infer<typeof toolErrorFieldSchema>
