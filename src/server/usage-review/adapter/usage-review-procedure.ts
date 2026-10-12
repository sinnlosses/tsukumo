// 使い方の見直しのコマンドの手続き。形は `usageReviewContract`。
// ここは表の行（`usageReviewCommands`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。

import { implement, type ORPCErrorConstructorMap } from "@orpc/server"

import type { COMMAND_ERRORS } from "../../../shared/command.ts"
import { usageReviewContract } from "../../../shared/contract/usage-review.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { type DispatchResult, receiveFeatureCommand } from "../../core/command-receiver.ts"
import {
  findUsageProposal,
  type UsageReviewCommandPorts,
  type UsageReviewSession,
  usageReviewCommands,
} from "../core/usage-review-command.ts"

export function usageReviewProcedure(ports: UsageReviewCommandPorts) {
  const procedure = implement(usageReviewContract).$context<{
    readonly session: UsageReviewSession
  }>()
  return procedure.router({
    start: procedure.start.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(
          usageReviewCommands(ports, context.session).start,
          input,
          context.session,
        ),
        errors,
      ),
    ),
    runProposal: procedure.runProposal.handler(({ input, context, errors }) => {
      if (findUsageProposal(context.session.state(), input) === undefined) {
        throw errors.REFUSED({ data: { reason: FRAME_ERROR_REASON.usageProposalNotFound } })
      }
      return refusedUnlessAccepted(
        receiveFeatureCommand(
          usageReviewCommands(ports, context.session).runProposal,
          input,
          context.session,
        ),
        errors,
      )
    }),
    interrupt: procedure.interrupt.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(
          usageReviewCommands(ports, context.session).interrupt,
          input,
          context.session,
        ),
        errors,
      ),
    ),
    dismissProposal: procedure.dismissProposal.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(
          usageReviewCommands(ports, context.session).dismissProposal,
          input,
          context.session,
        ),
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
