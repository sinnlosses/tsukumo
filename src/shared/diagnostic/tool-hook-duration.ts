// ツール1回の前に掛かった時間（`tool-hook-duration`）の足跡の形。
// ツールの名前は決まった語に写し、引数・結果・エラーの文は持たない。

import { z } from "zod"

const BUILTIN_TOOLS = [
  "Agent",
  "AskUserQuestion",
  "Bash",
  "Edit",
  "NotebookEdit",
  "Skill",
  "WebFetch",
  "WebSearch",
  "Write",
] as const

const TOOL_HOOK_DURATION_TOOLS = [...BUILTIN_TOOLS, "phase_result", "mcp", "other"] as const

/** 足跡に載せるツールの語。表に無い組み込みは `other`、tsukumo 以外の MCP は `mcp` に写す。 */
export type ToolHookDurationTool = (typeof TOOL_HOOK_DURATION_TOOLS)[number]

export const toolHookDurationFootprintSchema = z.object({
  flow: z.literal("tool-hook-duration"),
  /** ツールの結果を受けた時刻（エポックミリ秒）。 */
  at: z.number(),
  tool: z.enum(TOOL_HOOK_DURATION_TOOLS),
  inSubagent: z.boolean(),
  /** 結果を受けたフック。`PostToolUseFailure` はツールが失敗した回。 */
  hook: z.enum(["PostToolUse", "PostToolUseFailure"]),
  /** tsukumo の PreToolUse のフックが呼ばれてからツールが走り始めるまで。許可の問い合わせの待ちも含む。 */
  beforeToolMs: z.number(),
  /** ツールが走った時間（SDK の `duration_ms`）。 */
  toolMs: z.number(),
})

/** ツール1回の前に掛かった時間。 */
export type ToolHookDurationFootprint = Readonly<z.infer<typeof toolHookDurationFootprintSchema>>

/** 組み込みのツールの名前を足跡の語に写す。表に無い名前は `other`。 */
export function builtinToolHookDurationTool(toolName: string): ToolHookDurationTool {
  return BUILTIN_TOOLS.find((name) => name === toolName) ?? "other"
}
