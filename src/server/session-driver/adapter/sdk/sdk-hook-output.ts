// SDK のフックの入力の読み取りと、ツールの判定（`ToolVerdict`）からフックの出力への写し。

import type { BaseHookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk"

import type { ToolVerdict } from "../../../core/tool-verdict.ts"

export function isInSubagent(input: BaseHookInput): boolean {
  return input.agent_id !== undefined
}

/** 許可の判定を `canUseTool` へ回す出力。`updatedInput` を渡せば入力の差し替えも一緒に返す。 */
export function toAskOutput(updatedInput?: Readonly<Record<string, unknown>>): SyncHookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      ...(updatedInput === undefined ? {} : { updatedInput: { ...updatedInput } }),
    },
  }
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
