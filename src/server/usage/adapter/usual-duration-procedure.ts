// 「いつもは」の所要の手続き。形は `usualDurationContract`。照合は束ねる側のミドルウェアが済ませている。

import { implement } from "@orpc/server"

import { usualDurationContract } from "../../../shared/contract/usual-duration.ts"
import type { UsualDurations } from "../../../shared/usage/usual-duration.ts"

/** この機能の手続きが使う関数（中身は配線が渡す）。 */
export type UsualDurationProcedurePorts = {
  readonly readUsualDurations: () => UsualDurations
}

export function usualDurationProcedure(ports: UsualDurationProcedurePorts) {
  const procedure = implement(usualDurationContract)
  return procedure.router({
    usualDurations: procedure.usualDurations.handler(() => ports.readUsualDurations()),
  })
}
