// `tw status --claims` の出力（1行 JSON）から、この作業ツリーに着手中のタスクがあるかを決める。

import { claimsSchema } from "../../src/server/usage/adapter/tw-claim-list.ts"
import { parseJsonWith } from "../../src/shared/utils/parse-json.ts"

export type OpenClaimReading = "claimed" | "none" | "unreadable"

export function readOpenClaim(output: string): OpenClaimReading {
  const parsed = parseJsonWith(claimsSchema, output)
  if (parsed === undefined) {
    return "unreadable"
  }
  return parsed.claims.length > 0 ? "claimed" : "none"
}
