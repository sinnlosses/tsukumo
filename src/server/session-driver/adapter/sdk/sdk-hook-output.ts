// SDK のフックの入力の読み取りと、ツールの判定（`ToolVerdict`）からフックの出力への写し。

import type { BaseHookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk"

import type { ToolVerdict } from "../../../core/tool-verdict.ts"

export function isInSubagent(input: BaseHookInput): boolean {
  return input.agent_id !== undefined
}

export function toPreToolUseOutput(verdict: ToolVerdict): SyncHookJSONOutput {
  switch (verdict.kind) {
    case "allow":
      return {}
    case "deny":
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: verdict.reason,
        },
      }
    case "rewrite":
      return { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: verdict.input } }
  }
}
