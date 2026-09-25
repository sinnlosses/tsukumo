// 使い方の見直しのコマンドの手続き（`docs/glossary.md`「手続き」）。形は
// `src/shared/contract/usage-review.ts`、束ねるのは配線の `src/router.ts`。ここは表の行
// （`usage-review/core/usage-review-command.ts`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。

import { implement, type ORPCErrorConstructorMap } from "@orpc/server"

import { type COMMAND_ERRORS } from "../../../shared/command.ts"
import { usageReviewContract } from "../../../shared/contract/usage-review.ts"
import {
  type CommandEventSink,
  type DispatchResult,
  receiveFeatureCommand,
} from "../../core/command-receiver.ts"
import { type UsageReviewCommandPorts, usageReviewCommands } from "../core/usage-review-command.ts"

export function usageReviewProcedure(ports: UsageReviewCommandPorts) {
  const table = usageReviewCommands(ports)
  const procedure = implement(usageReviewContract).$context<{
    readonly session: CommandEventSink
  }>()
  return procedure.router({
    dismissProposal: procedure.dismissProposal.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.dismissProposal, input, context.session),
        errors,
      ),
    ),
  })
}

/** 受け付けなかったことを契約のエラー（`REFUSED`。理由は定型文だけ）に訳す。 */
async function refusedUnlessAccepted(
  pending: Promise<DispatchResult>,
  errors: ORPCErrorConstructorMap<typeof COMMAND_ERRORS>,
): Promise<void> {
  const result = await pending
  if (!result.ok) {
    throw errors.REFUSED({ data: { reason: result.reason } })
  }
}
