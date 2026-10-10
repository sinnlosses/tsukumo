// 別の窓で使用中のセッションの手続き。形は `sessionClaimContract`。
// 照合は束ねる側のミドルウェアが済ませている。

import { implement } from "@orpc/server"

import { sessionClaimContract } from "../../../shared/contract/session-claim.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type SessionClaimProcedurePorts = {
  /** 生きているほかの tsukumo が名乗ったセッションのID。読めないときは空で、投げない。 */
  readonly readOccupiedSessionIds: () => Promise<readonly string[]>
}

export function sessionClaimProcedure(ports: SessionClaimProcedurePorts) {
  const procedure = implement(sessionClaimContract)
  return procedure.router({
    occupied: procedure.occupied.handler(async () => [...(await ports.readOccupiedSessionIds())]),
  })
}
