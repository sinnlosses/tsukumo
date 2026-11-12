// 渡された `tw` の `lap-hook` を子として走らせ、
// 主のセッションの `SubagentStart`・`SubagentStop` に当てる。
// `accept-hook` は写さない。偽の起動では受け入れ役を起こさず、受け入れの準備と締めが要らないため。
// どの入力で段を書くかは子が決める。子の出力は委譲先の文脈に入りうるので結果へ写さず、常に `{}` を返す。

import type { HookCallback, HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"

import type { WorkflowTwFailurePlace } from "../../core/session-driver.ts"
import { runWorkflowTw, WORKFLOW_TW_TIMEOUT_MS, type WorkflowTwResult } from "./sdk-workflow-tw.ts"

// plugin の `hooks/hooks.json` の `lap-hook` の matcher と同じ値。
const START_MATCHER = "(^|:)(general-purpose|no-delegate|retrospector)$"
const STOP_MATCHER = "(^|:)(acceptor|retrospector)$"

/** hook の入力 JSON を標準入力に渡して `lap-hook` を走らせる。 */
export function runLapHook(twPath: string, stdin: string): Promise<WorkflowTwResult> {
  return runWorkflowTw({
    twPath,
    subcommand: "lap-hook",
    stdin,
    timeoutMs: WORKFLOW_TW_TIMEOUT_MS,
  })
}

/**
 * 取り込んだワークフローを載せないとき（`mountWorkflowPlugin` が偽）だけ、
 * `SubagentStart`・`SubagentStop` に `lap-hook` の matcher を足した表を返す。
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
    SubagentStart: [...(base.SubagentStart ?? []), { matcher: START_MATCHER, hooks: [hook] }],
    SubagentStop: [...(base.SubagentStop ?? []), { matcher: STOP_MATCHER, hooks: [hook] }],
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
