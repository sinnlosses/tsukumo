// ツール1回について、tsukumo の PreToolUse のフックが呼ばれた時刻を控え、結果を受けたときにツールが走り始めるまでの時間を返す。
// PreToolUse で拒まれたツールには結果のフックが来ないので、控えは古いものから捨てて上限に収める。

import {
  builtinToolHookDurationTool,
  type ToolHookDurationFootprint,
  type ToolHookDurationTool,
} from "../../../shared/diagnostic/tool-hook-duration.ts"
import {
  isTsukumoTool,
  PHASE_RESULT_TOOL_NAME,
  tsukumoToolFullName,
} from "../../core/tsukumo-tool-name.ts"

export type ToolHookClock = {
  /** PreToolUse のフックから、ツール呼び出しの ID を渡す。 */
  readonly started: (toolUseId: string) => void
  /** 結果のフックから、ツール呼び出しの ID とツールが走った時間を渡す。控えは消す。 */
  readonly finished: (toolUseId: string, toolMs: number) => ToolHookLap
}

/** PreToolUse のフックからツールが走り始めるまで。控えが無ければ（tsukumo の PreToolUse のフックが当たらないツール）`unseen`。 */
export type ToolHookLap =
  | { readonly kind: "measured"; readonly beforeToolMs: number }
  | { readonly kind: "unseen" }

/** 駆動が `diagnose` へ渡す所要の足跡（時刻は配線が付ける）。 */
export type ToolHookDurationLap = Omit<ToolHookDurationFootprint, "at">

/** 控えておく呼び出しの数の上限。 */
const MAX_PENDING = 64

/** {@link ToolHookClock} を1つ作る。駆動1つに1つ。 */
export function createToolHookClock(now: () => number): ToolHookClock {
  const pending = new Map<string, number>()

  return {
    started: (toolUseId) => {
      if (pending.size >= MAX_PENDING) {
        const oldest = pending.keys().next()
        if (oldest.done !== true) {
          pending.delete(oldest.value)
        }
      }
      pending.set(toolUseId, now())
    },
    finished: (toolUseId, toolMs) => {
      const startedAt = pending.get(toolUseId)
      if (startedAt === undefined) {
        return { kind: "unseen" }
      }
      pending.delete(toolUseId)
      return { kind: "measured", beforeToolMs: Math.max(0, now() - toolMs - startedAt) }
    },
  }
}

/** モデルから見えるツール名を、足跡に載せる語に写す。 */
export function toolHookDurationTool(toolName: string): ToolHookDurationTool {
  if (toolName === tsukumoToolFullName(PHASE_RESULT_TOOL_NAME)) {
    return "phase_result"
  }
  if (toolName.startsWith("mcp__") && !isTsukumoTool(toolName)) {
    return "mcp"
  }
  return builtinToolHookDurationTool(toolName)
}
