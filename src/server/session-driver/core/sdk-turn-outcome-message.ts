// `result` メッセージを、ターンの終わり方（`TurnOutcome`）に畳む。
// メッセージは外部由来の値なので、unknown で受けて検証する。

import type { TurnOutcome } from "../../../shared/session-driver/turn-failure.ts"

/**
 * `result` を終わり方に畳む（`TurnOutcome`）。
 *
 * - `success` は完了。ただし `is_error` が true なら API のエラーで止まった失敗（SDK の型定義: 「with is_error true, the error text when the turn ended on an API error」）
 * - `error_max_turns` / `error_max_budget_usd` はそれぞれの上限に当たった失敗
 * - `error_during_execution` は中断されたターンもこれで終わる（実測）。
 *   `terminal_reason` が中断（`aborted_streaming` / `aborted_tools`）なら中断。
 *   `terminal_reason` が無いときは、tsukumo がそのターンに中断を送っていた（`interruptSent`）ときだけ中断で、送っていなければ実行中のエラーの失敗
 * - 知らない subtype は実行中のエラーの失敗（成功と言い切れないものを黙って成功にしない）
 */
export function turnOutcome(
  message: Readonly<Record<string, unknown>>,
  interruptSent: boolean,
): TurnOutcome {
  switch (message.subtype) {
    case "success":
      return message.is_error === true
        ? { kind: "failed", cause: { kind: "api-error" } }
        : { kind: "completed" }
    case "error_max_turns":
      return { kind: "failed", cause: { kind: "max-turns" } }
    case "error_max_budget_usd":
      return { kind: "failed", cause: { kind: "max-budget" } }
    case "error_during_execution":
      return INTERRUPTED_TERMINAL_REASONS.has(message.terminal_reason) ||
        (message.terminal_reason === undefined && interruptSent)
        ? { kind: "interrupted" }
        : { kind: "failed", cause: { kind: "execution-error" } }
    default:
      return { kind: "failed", cause: { kind: "execution-error" } }
  }
}

/** `error_during_execution` を中断とみなす `terminal_reason`。 */
const INTERRUPTED_TERMINAL_REASONS: ReadonlySet<unknown> = new Set([
  "aborted_streaming",
  "aborted_tools",
])
