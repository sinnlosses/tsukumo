import type { DispatchResult } from "../core/command-receiver.ts"

/** 受け付けなかったコマンドを契約のエラー `REFUSED` に訳す。 */
export async function refusedUnlessAccepted(
  pending: Promise<DispatchResult>,
  errors: { REFUSED(options: { data: { reason: string } }): Error },
): Promise<void> {
  const result = await pending
  if (!result.ok) {
    throw errors.REFUSED({ data: { reason: result.reason } })
  }
}
