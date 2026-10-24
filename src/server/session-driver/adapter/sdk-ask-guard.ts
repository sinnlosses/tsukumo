// 渡された `tw` の `ask-guard` を子として走らせ、
// 主のセッションの `AskUserQuestion` の PreToolUse に当てる。
// 子が起動できない・失敗・出力が読めないときは何も拒まず（質問を通す側）、足跡だけ残す。
// 出力が空なのは「拒まない」の通常の答え。

import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import type { WorkflowTwFailurePlace } from "../core/session-driver.ts"
import { runWorkflowTw, WORKFLOW_TW_TIMEOUT_MS, type WorkflowTwResult } from "./sdk-workflow-tw.ts"

const ASK_TOOL = "AskUserQuestion"

const denyOutputSchema = z.object({
  hookSpecificOutput: z.looseObject({
    hookEventName: z.literal("PreToolUse"),
    permissionDecision: z.literal("deny"),
  }),
})

/** hook の入力 JSON を標準入力に渡して `ask-guard` を走らせる。 */
export function runAskGuard(twPath: string, stdin: string): Promise<WorkflowTwResult> {
  return runWorkflowTw({
    twPath,
    subcommand: "ask-guard",
    stdin,
    timeoutMs: WORKFLOW_TW_TIMEOUT_MS,
  })
}

/**
 * 取り込んだワークフローを載せないとき（`mountWorkflowPlugin` が偽）だけ、`PreToolUse` に `askGuardHooks` の matcher を足した表を返す。
 * 載せるときは plugin の `hooks/hooks.json` が同じ判定をするので、`base` をそのまま返す。
 * 子が失敗したときは拒まず、`report` に場所を渡す。
 */
export function withAskGuard(
  base: Partial<Record<HookEvent, HookCallbackMatcher[]>>,
  mountWorkflowPlugin: boolean,
  run: (stdin: string) => Promise<WorkflowTwResult>,
  report: (place: WorkflowTwFailurePlace) => void,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return mountWorkflowPlugin
    ? base
    : {
        ...base,
        PreToolUse: [...(base.PreToolUse ?? []), ...(askGuardHooks(run, report).PreToolUse ?? [])],
      }
}

function askGuardHooks(
  run: (stdin: string) => Promise<WorkflowTwResult>,
  report: (place: WorkflowTwFailurePlace) => void,
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
            let result: WorkflowTwResult
            try {
              result = await run(JSON.stringify(input))
            } catch {
              report("ask-guard-failed")
              return {}
            }
            if (result.kind !== "ok") {
              report(`ask-guard-${result.kind}`)
              return {}
            }
            if (result.stdout.trim() === "") {
              return {}
            }
            let json: unknown
            try {
              json = JSON.parse(result.stdout)
            } catch {
              report("ask-guard-unreadable")
              return {}
            }
            const parsed = denyOutputSchema.safeParse(json)
            return parsed.success ? parsed.data : {}
          },
        ],
      },
    ],
  }
}
