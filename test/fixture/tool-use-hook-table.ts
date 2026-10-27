// `preToolUseHooks`・`postToolUseHooks` の表を、Claude Code と同じく matcher でツールに当てて走らせる。

import type {
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  PostToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk"

import {
  postToolUseHooks,
  preToolUseHooks,
} from "../../src/server/session-driver/adapter/sdk-query-seed.ts"
import {
  createExternalToolMark,
  type ExternalToolMark,
} from "../../src/server/session-driver/core/external-tool-mark.ts"
import {
  createToolHookClock,
  type ToolHookClock,
  type ToolHookDurationLap,
} from "../../src/server/session-driver/core/tool-hook-clock.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"

/**
 * Claude Code がツールのイベントの matcher をツール名に当てる規則。
 * 空か `*` なら全部、英数字・`_`・`|`・`,`・空白・`-` だけなら `|` か `,` で区切って前後の空白を落とした名前との完全一致、ほかは正規表現。
 */
export function matcherHits(matcher: string | undefined, toolName: string): boolean {
  if (matcher === undefined || matcher === "" || matcher === "*") {
    return true
  }
  if (/^[A-Za-z0-9_|, -]+$/.test(matcher)) {
    return matcher
      .split(/[|,]/)
      .map((name) => name.trim())
      .includes(toolName)
  }
  return new RegExp(matcher).test(toolName)
}

export type PreToolUseSetup = {
  readonly gateRaised: () => boolean
  readonly bandPosition: () => string
  readonly externalToolMark: ExternalToolMark
  readonly rewriteBash: (command: string) => Promise<string | undefined>
  readonly planMissing: (() => boolean) | undefined
  readonly hookClock: ToolHookClock
}

/** 渡さなかった口を既定（印は下り、差し替えず、時計は 0）で埋めた `preToolUseHooks` の表。 */
export function preTable(
  setup: Partial<PreToolUseSetup>,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return preToolUseHooks(
    setup.gateRaised ?? (() => false),
    setup.bandPosition ?? (() => ""),
    setup.externalToolMark ?? createExternalToolMark(),
    setup.rewriteBash ?? (() => Promise.resolve(undefined)),
    setup.planMissing,
    setup.hookClock ?? createToolHookClock(() => 0),
  )
}

/** そのツールに当たった PreToolUse のフックを並べて走らせ、Claude Code と同じく返り値を畳む（`deny` が勝つ）。 */
export async function runPreToolUse(
  toolName: string,
  toolInput: unknown,
  agentId?: string,
  setup: Partial<PreToolUseSetup> = {},
): Promise<unknown> {
  const outputs = await runMatched(preTable(setup), "PreToolUse", {
    ...BASE_INPUT,
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: TOOL_USE_ID,
    ...(agentId === undefined ? {} : { agent_id: agentId }),
  })
  return outputs.find(isDeny) ?? outputs.find(isNonEmpty) ?? {}
}

export type PostToolUseSetup = {
  readonly onEvent: (event: SessionEvent) => void
  readonly externalToolMark: ExternalToolMark
  readonly hookClock: ToolHookClock
  readonly diagnose: (lap: ToolHookDurationLap) => void
}

type PostToolUseExtra = Partial<
  Pick<PostToolUseHookInput, "duration_ms" | "effort" | "permission_mode">
>

/** 結果のフック（`PostToolUse`、`failed` なら `PostToolUseFailure`）を、当たる matcher の分だけ走らせる。 */
export async function runPostToolUse(
  toolName: string,
  agentId: string | undefined,
  setup: Partial<PostToolUseSetup>,
  extra: PostToolUseExtra = {},
  failed = false,
): Promise<void> {
  const table = postToolUseHooks(
    setup.onEvent ?? (() => {}),
    setup.externalToolMark ?? createExternalToolMark(),
    setup.hookClock ?? createToolHookClock(() => 0),
    setup.diagnose ?? (() => {}),
  )
  const common = {
    ...BASE_INPUT,
    tool_name: toolName,
    tool_input: {},
    tool_use_id: TOOL_USE_ID,
    ...(agentId === undefined ? {} : { agent_id: agentId }),
    ...extra,
  }
  await (failed
    ? runMatched(table, "PostToolUseFailure", {
        ...common,
        hook_event_name: "PostToolUseFailure",
        error: "架空の失敗",
      })
    : runMatched(table, "PostToolUse", {
        ...common,
        hook_event_name: "PostToolUse",
        tool_response: "架空の結果",
      }))
}

const TOOL_USE_ID = "t-1"

const BASE_INPUT = {
  session_id: "s-1",
  transcript_path: "/tmp/tsukumo-test/fake.jsonl",
  cwd: "/tmp/tsukumo-test",
} as const

async function runMatched(
  table: Partial<Record<HookEvent, HookCallbackMatcher[]>>,
  event: HookEvent,
  input: HookInput & { readonly tool_name: string; readonly tool_use_id: string },
): Promise<readonly unknown[]> {
  const hooks = (table[event] ?? [])
    .filter((entry) => matcherHits(entry.matcher, input.tool_name))
    .flatMap((entry) => entry.hooks)
  return Promise.all(
    hooks.map((hook) => hook(input, input.tool_use_id, { signal: new AbortController().signal })),
  )
}

function isDeny(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output !== null &&
    "hookSpecificOutput" in output &&
    typeof output.hookSpecificOutput === "object" &&
    output.hookSpecificOutput !== null &&
    "permissionDecision" in output.hookSpecificOutput &&
    output.hookSpecificOutput.permissionDecision === "deny"
  )
}

function isNonEmpty(output: unknown): boolean {
  return typeof output === "object" && output !== null && Object.keys(output).length > 0
}
