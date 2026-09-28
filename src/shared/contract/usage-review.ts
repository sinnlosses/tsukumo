// 使い方の見直しのコマンドの契約。

import { z } from "zod"

import { commandBase } from "../command.ts"
import { USAGE_PROPOSAL_KINDS } from "../usage-review/usage-review.ts"

/**
 * 提案の対象（`UsageProposal.target`）の上限。形の検査ではなく素朴な上限。
 * 対象は MCP ツール名・メモリファイルのパス・モデル名などで、パスがいちばん長くなりうるので余裕を見た値にしてある。
 */
const MAX_USAGE_PROPOSAL_TARGET_LENGTH = 1_000

const dismissProposalInput = z.object({
  kind: z.enum(USAGE_PROPOSAL_KINDS),
  target: z.string().max(MAX_USAGE_PROPOSAL_TARGET_LENGTH),
})

/** 見送る提案（種類と対象の組）。 */
export type UsageProposalDismissal = z.infer<typeof dismissProposalInput>

export const usageReviewContract = {
  /**
   * トークン消費の画面の結果の札から、提案を1件見送る。
   * 識別子は種類と対象の組（`usageProposalKey`）で、見出しや根拠の言い回しが変わっても同じ提案を指す。
   * 次の見直しでも出さない。取り消す口は無い。
   */
  dismissProposal: commandBase.input(dismissProposalInput),
}
