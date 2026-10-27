// ステップごと・ターンごとの使用量を、tsukumo 内部のイベントに変換する。
// 使用量は外部由来の値なので、unknown で受けて検証する。

import { isPlainObject } from "remeda"

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { ModelTokenUsage } from "../../../shared/usage/token-usage.ts"

/**
 * `assistant` の `message.usage`（そのステップぶんの使用量）を1つのイベントにする。
 * `message.id` を一緒に運ぶ。
 * 返答が流れている間は同じ id の `assistant` が何度も届き、途中の `usage` は確定値ではない（`sdk.d.ts`。最初の1つは `output_tokens` が 1〜3 になる）。
 * 同じ id の最後を取るのは受け取った側（`createTokenUsageRecorder`）の仕事。
 *
 * 持ち場は `parent_tool_use_id` で決まる（非 null ならサブエージェントの中。`sdk.d.ts`）。
 * 鍵は API の形（snake_case）で、`result` の `modelUsage`（camelCase）とは違う。
 * 数でない値・欠けている鍵・`null` は 0 に倒し、`id` が無い・`usage` が無いメッセージはイベントを出さない。
 */
export function stepUsageEvents(
  message: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (!isPlainObject(message) || typeof message.id !== "string" || message.id === "") {
    return []
  }
  if (!isPlainObject(message.usage)) {
    return []
  }

  const usage = message.usage
  return [
    {
      kind: "step-usage",
      messageId: message.id,
      scope: parentToolUseId === undefined ? "main" : "subagent",
      usage: {
        inputTokens: finiteNumber(usage.input_tokens),
        outputTokens: finiteNumber(usage.output_tokens),
        cacheReadInputTokens: finiteNumber(usage.cache_read_input_tokens),
        cacheCreationInputTokens: finiteNumber(usage.cache_creation_input_tokens),
      },
    },
  ]
}

/**
 * `result` の `modelUsage`（モデル名をキーにした使用量の表）を1つのイベントにする。
 *
 * 運ぶのは累計そのまま。
 * `modelUsage` は `query()` の中の走行合計で、サブエージェントと内部の呼び出しも含む。
 * 同じ `result` の `usage` はメインループぶんだけなので集計に使わない（`sdk.d.ts` の型定義で確認）。
 * ターンごとの増分に直すのは `tokenUsageDelta`。
 *
 * 数でない値・欠けている鍵は 0 に倒す。
 * 表が無い・空・中身が全部壊れているときはイベントを出さない。
 */
export function tokenUsageEvents(modelUsage: unknown): readonly SessionEvent[] {
  if (!isPlainObject(modelUsage)) {
    return []
  }

  const cumulative = Object.entries(modelUsage).flatMap(([model, value]) =>
    model === "" || !isPlainObject(value) ? [] : [toModelTokenUsage(model, value)],
  )
  return cumulative.length === 0 ? [] : [{ kind: "token-usage", cumulative }]
}

/** `modelUsage` の1件を内部の型に写す。キーがモデルの名前（`canonicalModel` は見ない）。 */
function toModelTokenUsage(
  model: string,
  value: Readonly<Record<string, unknown>>,
): ModelTokenUsage {
  return {
    model,
    inputTokens: finiteNumber(value.inputTokens),
    outputTokens: finiteNumber(value.outputTokens),
    thinkingTokens: finiteNumber(value.thinkingTokens),
    cacheReadInputTokens: finiteNumber(value.cacheReadInputTokens),
    cacheCreationInputTokens: finiteNumber(value.cacheCreationInputTokens),
    costUsd: finiteNumber(value.costUSD),
  }
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}
