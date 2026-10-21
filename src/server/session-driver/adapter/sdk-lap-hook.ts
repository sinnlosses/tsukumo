// 取り込んだ tsukumo-plugins の入口 `bin/tw lap-hook` を子として走らせ、
// 主のセッションの `SubagentStart` と `Skill` の PreToolUse に当てる。
// どの入力で段を書くかは子が決める。子の出力は委譲先の文脈に入りうるので結果へ写さず、常に `{}` を返す。

import type { HookCallback, HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"

import type { WorkflowTwFailurePlace } from "../core/session-driver.ts"
import {
  runWorkflowTw,
  WORKFLOW_TW_TIMEOUT_MS,
  type WorkflowTwResult,
  workflowTwPath,
} from "./sdk-workflow-tw.ts"

const SKILL_TOOL = "Skill"

/** hook の入力 JSON を標準入力に渡して `lap-hook` を走らせる。 */
export function runLapHook(stdin: string): Promise<WorkflowTwResult> {
  return runWorkflowTw({
    twPath: workflowTwPath(),
    subcommand: "lap-hook",
    stdin,
    timeoutMs: WORKFLOW_TW_TIMEOUT_MS,
  })
}

/**
 * 取り込んだワークフローを載せないとき（`mountWorkflowPlugin` が偽）だけ、
 * `SubagentStart` と `PreToolUse` の `Skill` に `lap-hook` の matcher を足した表を返す。
 * 載せるときは plugin の `hooks/hooks.json` が同じ判定をするので、`base` をそのまま返す。
 * 子が失敗して段の記録が残らなかったときは、`report` に場所を渡す。
 */
export function withLapHook(
  base: Partial<Record<HookEvent, HookCallbackMatcher[]>>,
  mountWorkflowPlugin: boolean,
  run: (stdin: string) => Promise<WorkflowTwResult>,
  report: (place: WorkflowTwFailurePlace) => void,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  if (mountWorkflowPlugin) {
    return base
  }
  const hook = lapHook(run, report)
  return {
    ...base,
    PreToolUse: [...(base.PreToolUse ?? []), { matcher: SKILL_TOOL, hooks: [hook] }],
    SubagentStart: [...(base.SubagentStart ?? []), { hooks: [hook] }],
  }
}

function lapHook(
  run: (stdin: string) => Promise<WorkflowTwResult>,
  report: (place: WorkflowTwFailurePlace) => void,
): HookCallback {
  return async (input) => {
    try {
      const result = await run(JSON.stringify(input))
      if (result.kind !== "ok") {
        report(`lap-hook-${result.kind}`)
      }
    } catch {
      report("lap-hook-failed")
    }
    return {}
  }
}
