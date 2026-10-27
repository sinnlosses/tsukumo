// 段の番号（群ごとの通し番号）と、番号を使った段の呼び名・見出し・位置の字を組む決まり。

import {
  finishedPhaseCount,
  type DelegatedRange,
  phaseCount,
  type PlannedPhase,
  type WorkPhase,
  type WorkPlan,
} from "./work-plan.ts"

/**
 * 段の群。範囲が無ければ並び全体の `whole`、範囲があれば範囲の前の `lead`・範囲の `delegated`・範囲の後ろの `trail`。
 * 段の番号は群ごとに1から数える。
 */
export type PhaseSpan = "whole" | "lead" | "delegated" | "trail"

/**
 * 段の番号。`numbered` は群 `span` と、群の中の `ordinals`「2」（段が2つ以上なら「2–3」）と `text`「2/4」（「2–3/4」）、
 * `named` は番号を持たず名前だけで呼ぶ段（範囲の段の数が決まるまでの、範囲の先頭から後ろ）。
 */
export type PhaseNumber =
  | {
      readonly kind: "numbered"
      readonly span: PhaseSpan
      readonly ordinals: string
      readonly text: string
    }
  | { readonly kind: "named" }

/** 群の名「前」「本」「後」。並び全体の群は名を持たず空の文字列。 */
export const PHASE_SPAN_NAMES = {
  whole: "",
  lead: "前",
  delegated: "本",
  trail: "後",
} as const satisfies Record<PhaseSpan, string>

export function plannedPhaseNumber(
  plan: Pick<WorkPlan, "phases" | "delegatedRange">,
  phase: Pick<PlannedPhase, "index">,
): PhaseNumber {
  return phaseNumberOf(plan.delegatedRange, [phase.index], phaseCount(plan.phases))
}

/** 番号の字「後 1/3」（並び全体の群なら「1/3」）。番号を持たない段は空の文字列。 */
export function phaseNumberText(number: PhaseNumber): string {
  if (number.kind === "named") {
    return ""
  }
  const name = PHASE_SPAN_NAMES[number.span]
  return name === "" ? number.text : `${name} ${number.text}`
}

/** 群の名を前に付けた番号「後1」「2–3」（並び全体の群なら番号だけ）。番号を持たない段は空の文字列。 */
export function phaseOrdinalText(number: PhaseNumber): string {
  return number.kind === "named" ? "" : `${PHASE_SPAN_NAMES[number.span]}${number.ordinals}`
}

/** 全部の段（範囲の外を含む）で言う済み具合「5段すべて済み」「5段のうち4段済み」。 */
export function completionText(
  plan: Pick<WorkPlan, "phases" | "current" | "finishedInGroup">,
): string {
  const total = phaseCount(plan.phases)
  const finished = finishedPhaseCount(plan)
  return finished >= total
    ? `${String(total)}段すべて済み`
    : `${String(total)}段のうち${String(finished)}段済み`
}

/** 段の呼び名「後1. 段の名前」（範囲が無ければ「2. 段の名前」、番号を持たない段は名前だけ）。 */
export function plannedPhaseTitle(
  plan: Pick<WorkPlan, "phases" | "delegatedRange">,
  phase: Pick<PlannedPhase, "index" | "name">,
): string {
  const ordinal = phaseOrdinalText(plannedPhaseNumber(plan, phase))
  return ordinal === "" ? phase.name : `${ordinal}. ${phase.name}`
}

/**
 * 平らにした並びでの位置 `indexes`（全部で `total` 段）の段の番号。段の番号を組む唯一の場所。
 * 範囲が無ければ並び全体の通し番号。範囲があれば、範囲の前・範囲・範囲の後ろの群ごとに、群の先頭を1として群の段の数で数える。
 * 範囲の段の数が決まるまで（`pending`）は範囲の前だけを数え、範囲の先頭から後ろは `named`。
 */
export function phaseNumberOf(
  range: DelegatedRange,
  indexes: readonly number[],
  total: number,
): PhaseNumber {
  const [lead = 0] = indexes
  if (range.kind === "none") {
    return numbered("whole", indexes, 0, total)
  }
  if (lead < range.first) {
    return numbered("lead", indexes, 0, range.first)
  }
  if (range.kind === "pending") {
    return { kind: "named" }
  }
  const end = range.first + range.count
  return lead < end
    ? numbered("delegated", indexes, range.first, range.count)
    : numbered("trail", indexes, end, total - end)
}

/** 段の見出し「後 1/3 段の名前」（範囲が無ければ「2/4 段の名前」、今の段が2つ以上なら「本 2–3/4 段B・段C」、番号を持たない段は名前だけ）。 */
export function phaseLabel(phase: Extract<WorkPhase, { readonly kind: "phase" }>): string {
  const text = phaseNumberText(phasePosition(phase))
  return text === "" ? phase.name : `${text} ${phase.name}`
}

export function phasePosition(phase: Extract<WorkPhase, { readonly kind: "phase" }>): PhaseNumber {
  return phaseNumberOf(phase.range, phase.indexes, phase.count)
}

/** 並列の段の中の段は平らにした並びで隣り合うので、2つ以上なら先頭と末尾の番号を「–」でつなぐ。 */
function numbered(
  span: PhaseSpan,
  indexes: readonly number[],
  origin: number,
  count: number,
): PhaseNumber {
  const ordinalOf = (index: number): string => String(index - origin + 1)
  const [first] = indexes
  const last = indexes.at(-1)
  const ordinals =
    first === undefined || last === undefined || first === last
      ? ordinalOf(first ?? origin)
      : `${ordinalOf(first)}${ORDINAL_RANGE_SEPARATOR}${ordinalOf(last)}`
  return { kind: "numbered", span, ordinals, text: `${ordinals}/${String(count)}` }
}

const ORDINAL_RANGE_SEPARATOR = "–"
