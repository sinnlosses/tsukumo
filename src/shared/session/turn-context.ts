// 同じやり取り（最後の `request` より後）の中で、前にある記録から後ろの記録へ持ち回すもの。
// 記録を前から1回なぞるあいだに積み上げ、記録ごとに頭から探し直さないために置く。

import type { SessionRecord } from "./session-state.ts"
import { bashCommandOf, isToolRecord, toolRecordDuration, type ToolDuration } from "./turn-step.ts"
import { isWorkPlanRecord, workPlanOf, type LatestWorkPlan } from "./work-plan.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>
type ToolRecord = Extract<SessionRecord, { readonly kind: "tool" }>

/**
 * 持ち回すもの。
 * `plan` は最後の `work-plan` の記録、`bashByCommand` はコマンドごとの最後の Bash の `tool` の記録。
 */
export type TurnContext = {
  readonly plan: WorkPlanRecord | "none"
  readonly bashByCommand: ReadonlyMap<string, ToolRecord>
}

export const EMPTY_TURN_CONTEXT = {
  plan: "none",
  bashByCommand: new Map<string, ToolRecord>(),
} as const satisfies TurnContext

/** `record` を1件なぞったあとの文脈。`request` で空に戻る。 */
export function advanceTurnContext(context: TurnContext, record: SessionRecord): TurnContext {
  if (record.kind === "request") {
    return EMPTY_TURN_CONTEXT
  }
  if (isWorkPlanRecord(record)) {
    return { ...context, plan: record }
  }
  if (isToolRecord(record) && record.name === "Bash") {
    return {
      ...context,
      bashByCommand: new Map([...context.bashByCommand, [bashCommandOf(record.input), record]]),
    }
  }
  return context
}

/** 文脈の範囲で最後に渡された段取り。 */
export function latestWorkPlanOf(context: TurnContext): LatestWorkPlan {
  return context.plan === "none" ? { kind: "none" } : workPlanOf(context.plan)
}

/** `command` をそのまま打った最後の Bash の記録。無ければ `none`。 */
export function lastBashOf(context: TurnContext, command: string): ToolRecord | "none" {
  return context.bashByCommand.get(command) ?? "none"
}

/** `command` をそのまま打った最後の Bash の所要時間。無ければ `unknown`。 */
export function bashCommandDuration(context: TurnContext, command: string): ToolDuration {
  const matched = lastBashOf(context, command)
  return matched === "none" ? { kind: "unknown" } : toolRecordDuration(matched)
}
