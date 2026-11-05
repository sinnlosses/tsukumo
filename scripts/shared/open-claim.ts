// `tw status --claims` の出力（1行 JSON）から、この作業ツリーに着手中のタスクがあるかを決める。

import { z } from "zod"

import { parseJsonWith } from "../../src/shared/utils/parse-json.ts"

export type OpenClaimReading = "claimed" | "none" | "unreadable"

const claimsSchema = z.object({ claims: z.array(z.object({ task: z.string() })) })

export function readOpenClaim(output: string): OpenClaimReading {
  const parsed = parseJsonWith(claimsSchema, output)
  if (parsed === undefined) {
    return "unreadable"
  }
  return parsed.claims.length > 0 ? "claimed" : "none"
}
