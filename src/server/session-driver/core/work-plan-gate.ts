// 委譲の返却が届いてからメインが `work_plan` を呼ぶまでのあいだ、メインの作業のツールを拒む判定。

import { tsukumoToolFullName } from "./tsukumo-tool-name.ts"

const READ_ONLY_TOOL_NAMES = ["Read", "Grep", "Glob", "ToolSearch"] as const satisfies string[]

const TSUKUMO_TOOL_PREFIX = tsukumoToolFullName("")

export type GateVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }

const DENY_REASON =
  "委譲先の返却が届いています。作業のツールは、`work_plan` で段を進めるか、同じ段のまま呼んでから使います（読み取りと tsukumo のツールはそのまま使えます）。これは利用者には見えない差し戻しです。"

/** 印が立っているときに、メインのこのツール呼び出しを通すか。サブエージェントの中の呼び出しは対象にしない。 */
export function judgeToolAgainstGate(toolName: string, inSubagent: boolean): GateVerdict {
  if (
    inSubagent ||
    READ_ONLY_TOOL_NAMES.some((name) => name === toolName) ||
    toolName.startsWith(TSUKUMO_TOOL_PREFIX)
  ) {
    return { kind: "allow" }
  }
  return { kind: "deny", reason: DENY_REASON }
}
