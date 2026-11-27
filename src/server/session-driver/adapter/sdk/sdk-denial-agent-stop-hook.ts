// 拒んだエージェントが終わったとき、そのエージェントの許可のお願いと印を下げる `SubagentStop` フックの登録。

import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"

import type { DenialGrants } from "../../core/denial-grant.ts"

/** 同じイベントのキーを上書きせず、matcher の並びを足し合わせる。 */
export function mergeHookMatchers(
  ...tables: readonly Partial<Record<HookEvent, HookCallbackMatcher[]>>[]
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const merged = new Map<string, HookCallbackMatcher[]>()
  for (const table of tables) {
    for (const [event, matchers] of Object.entries(table)) {
      merged.set(event, [...(merged.get(event) ?? []), ...matchers])
    }
  }
  return Object.fromEntries(merged)
}

/** `SubagentStop` の `agent_id` を {@link DenialGrants} の `finishAgent` へ渡す。止めはしない。 */
export function denialAgentStopHooks(
  finishAgent: DenialGrants["finishAgent"],
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    SubagentStop: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name === "SubagentStop") {
              finishAgent(input.agent_id)
            }
            return {}
          },
        ],
      },
    ],
  }
}
