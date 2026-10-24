import type { Expression } from "../../src/shared/character-pack/expression.ts"

// フィクスチャはすべて手で書いた架空のやり取り。実物の会話は使わない
export const EXPRESSIONS: readonly Expression[] = ["default", "thinking", "proud"]

export function assistantMessageWithoutUuid(
  content: readonly unknown[],
  parentToolUseId?: string,
): Record<string, unknown> {
  return {
    type: "assistant",
    message: { role: "assistant", content },
    session_id: "s-1",
    parent_tool_use_id: parentToolUseId ?? null,
  }
}
