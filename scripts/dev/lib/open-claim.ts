// `tw status --claims` の出力（1行 JSON）から、この作業ツリーに着手中のタスクがあるかを決める。

import { z } from "zod"

export type OpenClaimReading = "claimed" | "none" | "unreadable"

const claimsSchema = z.object({ claims: z.array(z.object({ task: z.string() })) })

export function readOpenClaim(output: string): OpenClaimReading {
  try {
    const parsed = claimsSchema.safeParse(JSON.parse(output))
    if (!parsed.success) {
      return "unreadable"
    }
    return parsed.data.claims.length > 0 ? "claimed" : "none"
  } catch {
    return "unreadable"
  }
}
