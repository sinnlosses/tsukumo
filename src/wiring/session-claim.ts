// セッションの占有の画面の配線。ほかの tsukumo が持っているセッションの id を読む口を選ぶ。

import {
  defaultSessionClaimPlace,
  readOccupiedSessionIds,
} from "../server/session-driver/adapter/session-claim-file.ts"
import type { SessionClaimProcedurePorts } from "../server/session/adapter/session-claim-procedure.ts"

export function wireSessionClaim(): { readonly rpc: SessionClaimProcedurePorts } {
  return {
    rpc: {
      readOccupiedSessionIds: () => readOccupiedSessionIds(defaultSessionClaimPlace()),
    },
  }
}
