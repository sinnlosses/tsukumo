// 本体と mermaid の worker の間で往復するメッセージの形。受け取る側が `unknown` から検証する。

import { z } from "zod"

import type { MermaidFault } from "../core/report-violation.ts"

const faultSchema = z.union([
  z.object({
    kind: z.literal("located"),
    block: z.number().int(),
    line: z.number().int(),
    token: z.string(),
  }),
  z.object({ kind: z.literal("unlocated"), block: z.number().int() }),
]) satisfies z.ZodType<MermaidFault>

export const checkRequestSchema = z.object({
  id: z.number().int(),
  sources: z.array(z.string()),
})

/** `ok: false` は worker が mermaid を読み込めなかったなど、検査そのものが動かなかったとき。 */
export const checkReplySchema = z.discriminatedUnion("ok", [
  z.object({ id: z.number().int(), ok: z.literal(true), faults: z.array(faultSchema) }),
  z.object({ id: z.number().int(), ok: z.literal(false) }),
])
