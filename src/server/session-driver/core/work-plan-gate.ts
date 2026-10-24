// 委譲の返却が届いてからメインが `work_plan` を呼ぶまでのあいだ、メインの作業のツールを拒む判定と、
// その依頼で最初の `work_plan` を受け付けるまでのあいだ、メインの `Edit`・`Write` を拒む判定。

import { isTsukumoTool } from "./tsukumo-tool-name.ts"

const READ_ONLY_TOOL_NAMES = ["Read", "Grep", "Glob", "ToolSearch"] as const satisfies string[]

export type GateVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }

const DENY_REASON =
  "委譲先の返却が届いています。作業のツールは、`work_plan` で段を進めるか、同じ段のまま呼んでから使います（読み取りと tsukumo のツールはそのまま使えます）。これは利用者には見えない差し戻しです。"

/** 印が立っているときに、メインのこのツール呼び出しを通すか。サブエージェントの中の呼び出しは対象にしない。 */
export function judgeToolAgainstGate(
  toolName: string,
  inSubagent: boolean,
  bandPosition: string,
): GateVerdict {
  if (
    inSubagent ||
    READ_ONLY_TOOL_NAMES.some((name) => name === toolName) ||
    isTsukumoTool(toolName)
  ) {
    return { kind: "allow" }
  }
  return {
    kind: "deny",
    reason: bandPosition === "" ? DENY_REASON : `${DENY_REASON}${bandPosition}`,
  }
}

const EDIT_TOOL_NAMES = ["Edit", "Write"] as const satisfies string[]

const AUTO_MEMORY_PATH = /(^|\/)\.claude\/projects\/[^/]+\/memory\//

const PLAN_MISSING_REASON =
  "`work_plan` をまだ渡していません。仕事に入る前に、`current: 0`（段1）で `work_plan` を先に渡してください（読み取りと tsukumo のツールはそのまま使えます）。これは利用者には見えない差し戻しです。"

/**
 * その依頼で受け付け済みの `work_plan` が無いときに、メインのこのツール呼び出しを通すか。呼ぶ側が無いことを確かめてから呼ぶ。
 * 拒むのは `Edit`・`Write` だけで、サブエージェントの中と自動メモリの置き場への書き込みは通す。
 */
export function judgeEditAgainstMissingPlan(
  toolName: string,
  inSubagent: boolean,
  filePath: string | undefined,
): GateVerdict {
  if (
    inSubagent ||
    !EDIT_TOOL_NAMES.some((name) => name === toolName) ||
    (filePath !== undefined && isAutoMemoryPath(filePath))
  ) {
    return { kind: "allow" }
  }
  return { kind: "deny", reason: PLAN_MISSING_REASON }
}

function isAutoMemoryPath(filePath: string): boolean {
  return AUTO_MEMORY_PATH.test(filePath) && !filePath.split("/").includes("..")
}
