// 委譲の返却が届いてからメインが `work_plan` を呼ぶまでのあいだ、メインの作業のツールを拒む判定と、
// その依頼で最初の `work_plan` を受け付けるまでのあいだ、メインの `Edit`・`Write` を拒む判定。

import { isDeepEqual, isPlainObject } from "remeda"
import { z } from "zod"

import { phaseElementSchema } from "../../../shared/session/work-plan-phase-id.ts"
import { type LatestWorkPlan, plannedPhasesOf } from "../../../shared/session/work-plan.ts"
import type { ToolVerdict } from "../../core/tool-verdict.ts"
import { tsukumoToolFullName } from "../../core/tsukumo-tool-name.ts"

/** 委譲ゲートが拒まないツールの名前（読み取り）。 */
export const GATE_EXEMPT_TOOL_NAMES = [
  "Read",
  "Grep",
  "Glob",
  "ToolSearch",
] as const satisfies string[]

/** 委譲ゲートが拒まないツールの名前の頭（tsukumo のツール）。 */
export const GATE_EXEMPT_TOOL_PREFIX = tsukumoToolFullName("")

const DENY_REASON =
  "委譲先の返却が届いています。作業のツールは、`work_plan` でフェーズを進めるか、同じ位置のまま呼んでから使います（読み取りと tsukumo のツールはそのまま使えます）。これは利用者には見えない差し戻しです。"

/** 印が立っているときに、メインのこのツール呼び出しを通すか。サブエージェントの中の呼び出しは対象にしない。 */
export function judgeToolAgainstGate(
  toolName: string,
  inSubagent: boolean,
  bandPosition: string,
): ToolVerdict {
  if (inSubagent || !isGatedTool(toolName)) {
    return { kind: "allow" }
  }
  return {
    kind: "deny",
    reason: bandPosition === "" ? DENY_REASON : `${DENY_REASON}${bandPosition}`,
  }
}

/** 委譲ゲートが拒みうるツールか（読み取りと tsukumo のツール以外）。 */
export function isGatedTool(toolName: string): boolean {
  return (
    !GATE_EXEMPT_TOOL_NAMES.some((name) => name === toolName) &&
    !toolName.startsWith(GATE_EXEMPT_TOOL_PREFIX)
  )
}

const EDIT_TOOL_NAMES = ["Edit", "Write"] as const satisfies string[]

const AUTO_MEMORY_PATH = /(^|\/)\.claude\/projects\/[^/]+\/memory\//

const PLAN_MISSING_REASON =
  "`work_plan` をまだ渡していません。仕事に入る前に、`current: 0` で `work_plan` を先に渡してください（読み取りと tsukumo のツールはそのまま使えます）。これは利用者には見えない差し戻しです。"

/**
 * その依頼で受け付け済みの `work_plan` が無いときに、メインのこのツール呼び出しを通すか。呼ぶ側が無いことを確かめてから呼ぶ。
 * 拒むのは `Edit`・`Write` だけで、サブエージェントの中と自動メモリの置き場への書き込みは通す。
 */
export function judgeEditAgainstMissingPlan(
  toolName: string,
  inSubagent: boolean,
  filePath: string | undefined,
): ToolVerdict {
  if (
    inSubagent ||
    !EDIT_TOOL_NAMES.some((name) => name === toolName) ||
    (filePath !== undefined && isAutoMemoryPath(filePath))
  ) {
    return { kind: "allow" }
  }
  return { kind: "deny", reason: PLAN_MISSING_REASON }
}

export type ImplementerStopVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "block"; readonly reason: string }

/**
 * ワークフロースクリプトの agent が終わろうとするときに、実装の範囲の最後の段の id まで `phase_result` の申告が届いているかを、受け付け済みのワークプランで照らす。
 * `agentPhaseTitle` はワークフロースクリプトの写しでその agent がいる段の題（段の id）で、写しに無ければ undefined。
 * 届いていなければ、残りの段の id を添えて止める。
 * 写しに無い agent、段の id を持たないワークプラン、委譲の範囲が確定していないワークプラン、実装の範囲の外の agent は止めない。
 * 一度止められたあと（`stopHookActive`）の終わりも通す。実装の段の題で走っても `phase_result` を呼ばない agent（計画の判定など）と、`stopped` で止めた実装役を止め続けないため。
 */
export function judgeImplementerStop(
  agentPhaseTitle: string | undefined,
  plan: LatestWorkPlan,
  stopHookActive: boolean,
): ImplementerStopVerdict {
  if (
    stopHookActive ||
    agentPhaseTitle === undefined ||
    plan.kind !== "planned" ||
    plan.delegatedRange.kind !== "range"
  ) {
    return { kind: "allow" }
  }
  const { first, count } = plan.delegatedRange
  const position = plan.phaseIds.indexOf(agentPhaseTitle)
  if (position < first || position >= first + count) {
    return { kind: "allow" }
  }
  const phases = plannedPhasesOf(plan)
  const last = phases[first + count - 1]
  if (last === undefined || last.state === "done") {
    return { kind: "allow" }
  }
  const remaining = plan.phaseIds
    .slice(first, first + count)
    .filter((_, offset) => phases[first + offset]?.state !== "done")
  return {
    kind: "block",
    reason:
      `実装の範囲の最後の段（${plan.phaseIds[first + count - 1] ?? ""}）まで phase_result を呼んでいません。残りの段 ${JSON.stringify(remaining)} を番号の順に済ませ、段ごとに phase_result（count は ${String(count)}。飛ばすなら outcome を skipped）を呼んでから終わってください。` +
      "これは利用者には見えない差し戻しです。",
  }
}

const WORKFLOW_TOOL_NAME = "Workflow"

const phaseIdsArgSchema = z.array(z.union([phaseElementSchema, z.array(phaseElementSchema)]))

/**
 * ワークフロースクリプト（`Workflow`）の起動の args の `phaseIds` を、今のワークプランの段の id の並び全体（計画の段を含む）と照らす。
 * 違えば、正しい並びを添えて拒む。
 * `phaseIds` の無い起動、`Workflow` 以外、サブエージェントの中、段の id を持たないワークプラン、委譲の範囲を持たないワークプランは通す。
 */
export function judgeWorkflowPhaseIds(
  toolName: string,
  toolInput: unknown,
  inSubagent: boolean,
  plan: LatestWorkPlan,
): ToolVerdict {
  const given = givenPhaseIdsOf(toolInput)
  if (
    toolName !== WORKFLOW_TOOL_NAME ||
    inSubagent ||
    given === undefined ||
    plan.kind !== "planned" ||
    plan.phaseIds.length === 0 ||
    plan.delegatedRange.kind === "none"
  ) {
    return { kind: "allow" }
  }
  const expected = plan.phaseIds
  if (given.kind === "ids" && isDeepEqual(given.ids, expected)) {
    return { kind: "allow" }
  }
  return {
    kind: "deny",
    reason:
      `Workflow の args の phaseIds が、今のワークプランの段の id の並びと違います。正しい並びは ${JSON.stringify(expected)} です。` +
      "`tw plan-phases` の phases をそのまま `work_plan` と args の両方へ渡し直してください。これは利用者には見えない差し戻しです。",
  }
}

type GivenPhaseIds =
  | { readonly kind: "ids"; readonly ids: readonly string[] }
  | { readonly kind: "malformed" }

/** 起動の入力の `args.phaseIds` を、平らにした読み順の id にする。`phaseIds` が無ければ undefined。 */
function givenPhaseIdsOf(toolInput: unknown): GivenPhaseIds | undefined {
  const args = isPlainObject(toolInput) ? toolInput.args : undefined
  if (!isPlainObject(args) || args.phaseIds === undefined) {
    return undefined
  }
  const parsed = phaseIdsArgSchema.safeParse(args.phaseIds)
  return parsed.success
    ? {
        kind: "ids",
        ids: parsed.data
          .flat()
          .map((element) => (typeof element === "string" ? element : element.id)),
      }
    : { kind: "malformed" }
}

function isAutoMemoryPath(filePath: string): boolean {
  return AUTO_MEMORY_PATH.test(filePath) && !filePath.split("/").includes("..")
}
