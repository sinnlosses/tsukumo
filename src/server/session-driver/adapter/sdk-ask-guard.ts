// 取り込んだ tsukumo-plugins の入口 `bin/tw ask-guard` を子として走らせ、
// 主のセッションの `AskUserQuestion` の PreToolUse に当てる。
// 子が起動できない・失敗・出力が読めないときは何も拒まない（質問を通す側）。

import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { runWorkflowTw, WORKFLOW_TW_TIMEOUT_MS, workflowTwPath } from "./sdk-workflow-tw.ts"

const ASK_TOOL = "AskUserQuestion"

const denyOutputSchema = z.object({
  hookSpecificOutput: z.looseObject({
    hookEventName: z.literal("PreToolUse"),
    permissionDecision: z.literal("deny"),
  }),
})

/** hook の入力 JSON を標準入力に渡して `ask-guard` を走らせ、標準出力を返す。失敗・タイムアウトは空文字列。 */
export function runAskGuard(stdin: string): Promise<string> {
  return runWorkflowTw({
    twPath: workflowTwPath(),
    subcommand: "ask-guard",
    stdin,
    timeoutMs: WORKFLOW_TW_TIMEOUT_MS,
  })
}

/**
 * 取り込んだワークフローを載せないとき（`mountWorkflowPlugin` が偽）だけ、`PreToolUse` に `askGuardHooks` の matcher を足した表を返す。
 * 載せるときは plugin の `hooks/hooks.json` が同じ判定をするので、`base` をそのまま返す。
 */
export function withAskGuard(
  base: Partial<Record<HookEvent, HookCallbackMatcher[]>>,
  mountWorkflowPlugin: boolean,
  run: (stdin: string) => Promise<string>,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return mountWorkflowPlugin
    ? base
    : {
        ...base,
        PreToolUse: [...(base.PreToolUse ?? []), ...(askGuardHooks(run).PreToolUse ?? [])],
      }
}

function askGuardHooks(
  run: (stdin: string) => Promise<string>,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [
      {
        matcher: ASK_TOOL,
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PreToolUse" || input.tool_name !== ASK_TOOL) {
              return {}
            }
            try {
              const output = await run(JSON.stringify(input))
              const parsed = denyOutputSchema.safeParse(JSON.parse(output))
              return parsed.success ? parsed.data : {}
            } catch {
              return {}
            }
          },
        ],
      },
    ],
  }
}
