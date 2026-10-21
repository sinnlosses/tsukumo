// セッションの起動直後に1回だけ SDK へ問い合わせる付帯情報（コマンドの説明・プラン・モデルごとの effort の対応）を内部イベントにして流す。
// どれも取れなくてもセッションは続ける。

import { type ClaudeAccountTier, planName } from "../core/plan.ts"
import { toCommandDescriptions, toModelEffortSupport, toPlan } from "../core/sdk-query-reply.ts"
import type { SessionDriverOptions } from "../core/session-driver.ts"
import { readClaudeAccountTier } from "./claude-account.ts"

/**
 * コマンドの説明を1回だけ取りに行く。
 * `init` の `slash_commands` は名前だけなので、説明はこの制御リクエストから受け取る（組み込みコマンドの分も返る）。
 * 以降セッション中に増減したときは `commands_changed` が押してくる（`toCommandDescriptions`）。
 * 取れなくてもセッションは続ける（説明が無いまま名前だけの補完に戻るだけ）。
 */
export async function relayCommandDescriptions(
  session: { readonly supportedCommands: () => Promise<unknown> },
  options: SessionDriverOptions,
): Promise<void> {
  try {
    const descriptions = toCommandDescriptions(await session.supportedCommands())
    if (descriptions.length > 0) {
      options.onEvent({ kind: "command-descriptions", descriptions })
    }
  } catch {
    // 説明が付かないだけなので、何も流さずに諦める。
  }
}

/**
 * プランを1回だけ取りに行く。
 * `accountInfo()` は `email` / `organization` も返すが、駆動の外へ出すのは `toPlan` が取り出した `subscriptionType` だけ。
 *
 * 名前は Claude Code の控えを先に見て決める（`planName`）。
 * SDK の `subscriptionType` は契約の段と合わないことがあり、控えのほうが段と枠を別々に持つ。
 * 控えから決まらなければ SDK の値をそのまま出す。
 *
 * 取れなくてもセッションは続ける（API キーや Bedrock のときは元々この値が無い）。
 */
export async function relayPlan(
  session: { readonly accountInfo: () => Promise<unknown> },
  options: SessionDriverOptions,
  readTier: () => ClaudeAccountTier = () => readClaudeAccountTier(options.claudeConfigDir),
): Promise<void> {
  try {
    const plan = planName(readTier(), toPlan(await session.accountInfo()))
    if (plan !== undefined) {
      options.onEvent({ kind: "plan", plan })
    }
  } catch {
    // プランが取れないだけなので、何も流さずに諦める。
  }
}

/**
 * モデルごとの effort の対応（`ModelEffortSupport`）を `supportedModels()` から1回だけ取りに行く。
 * 取れなくても・空でもセッションは続ける（画面は effort を「対応するかどうか分からない」のまま扱うだけ）。
 */
export async function relaySupportedModels(
  session: { readonly supportedModels: () => Promise<unknown> },
  options: SessionDriverOptions,
): Promise<void> {
  try {
    const models = toModelEffortSupport(await session.supportedModels())
    if (models.length > 0) {
      options.onEvent({ kind: "model-effort-support", models })
    }
  } catch {
    // 対応が取れないだけなので、何も流さずに諦める。
  }
}
