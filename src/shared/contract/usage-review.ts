// 使い方の見直しのコマンドの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/usage-review/adapter/usage-review-procedure.ts`、委ね先の行は
// `src/server/usage-review/core/usage-review-command.ts`。

import { z } from "zod"

import { commandBase } from "../command.ts"
import { USAGE_PROPOSAL_KINDS } from "../usage-review.ts"

/**
 * 提案の対象（`UsageProposal.target`）の上限。形の検査ではなく素朴な上限——対象は
 * MCP ツール名・メモリファイルのパス・モデル名などで、パスがいちばん長くなりうるので
 * 余裕を見た値にしてある。
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
   * トークン消費の画面の結果の札から、提案を1件見送る。識別子は種類と対象の組
   * （`usageProposalKey`）——見出しや根拠の言い回しが変わっても同じ提案を指す。次の見直しでも
   * 出さない（`src/server/usage-review/core/usage-review-tool.ts` の `dismissedKeys`）。取り消す口は無い
   * （`docs/design.md`「見直しのツールと状態」）。
   */
  dismissProposal: commandBase.input(dismissProposalInput),
}
