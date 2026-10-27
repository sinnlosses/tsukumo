// 使い方の見直しのコマンドの契約。

import { z } from "zod"

import { commandBase } from "../command.ts"
import { USAGE_PROPOSAL_KINDS } from "../usage/usage-review.ts"

/**
 * 提案の対象（`UsageProposal.target`）の上限。形の検査ではなく素朴な上限。
 * 対象は MCP ツール名・メモリファイルのパス・モデル名などで、パスがいちばん長くなりうるので余裕を見た値にしてある。
 */
const MAX_USAGE_PROPOSAL_TARGET_LENGTH = 1_000

const usageProposalKeyInput = z.object({
  kind: z.enum(USAGE_PROPOSAL_KINDS),
  target: z.string().max(MAX_USAGE_PROPOSAL_TARGET_LENGTH),
})

/** 提案を指す種類と対象の組（識別子 `usageProposalKey` の元）。 */
export type UsageProposalKeyInput = z.infer<typeof usageProposalKeyInput>

export const usageReviewContract = {
  /**
   * トークン消費の画面から見直しを始める。会話とは別の問い合わせで走るので、ターン中・雑談中でも受ける。
   * 見直しか提案の実行がもう走っているときは断る。
   */
  start: commandBase,
  /**
   * 結果の札の提案を1件実行する。依頼文は画面から受け取らず、サーバがいまの結果か前回の結果から識別子で引いた提案から組む。
   * 見つからない・ほかが走っているときは断る。
   */
  runProposal: commandBase.input(usageProposalKeyInput),
  /** 走っている見直しか提案の実行を止める。何も走っていなければ何もしない。 */
  interrupt: commandBase,
  /**
   * トークン消費の画面の結果の札から、提案を1件見送る。
   * 識別子は種類と対象の組（`usageProposalKey`）で、見出しや根拠の言い回しが変わっても同じ提案を指す。
   * 次の見直しでも出さない。取り消す口は無い。
   */
  dismissProposal: commandBase.input(usageProposalKeyInput),
}
