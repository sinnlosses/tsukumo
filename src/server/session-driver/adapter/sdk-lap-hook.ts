// 取り込んだ tsukumo-plugins の入口 `bin/tw lap-hook` を子として走らせ、
// 主のセッションの `SubagentStart` と `Skill` の PreToolUse に当てる。
// どの入力で段を書くかは子が決める。子の出力は委譲先の文脈に入りうるので結果へ写さず、常に `{}` を返す。

import type { HookCallback, HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"

import { runWorkflowTw, WORKFLOW_TW_TIMEOUT_MS, workflowTwPath } from "./sdk-workflow-tw.ts"

const SKILL_TOOL = "Skill"

/** hook の入力 JSON を標準入力に渡して `lap-hook` を走らせる。失敗・タイムアウトは空文字列。 */
export function runLapHook(stdin: string): Promise<string> {
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
 */
export function withLapHook(
  base: Partial<Record<HookEvent, HookCallbackMatcher[]>>,
  mountWorkflowPlugin: boolean,
  run: (stdin: string) => Promise<string>,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  if (mountWorkflowPlugin) {
    return base
  }
  const hook = lapHook(run)
  return {
    ...base,
    PreToolUse: [...(base.PreToolUse ?? []), { matcher: SKILL_TOOL, hooks: [hook] }],
    SubagentStart: [...(base.SubagentStart ?? []), { hooks: [hook] }],
  }
}

function lapHook(run: (stdin: string) => Promise<string>): HookCallback {
  return async (input) => {
    try {
      await run(JSON.stringify(input))
    } catch {
      // 子の失敗では会話を止めない。
    }
    return {}
  }
}
