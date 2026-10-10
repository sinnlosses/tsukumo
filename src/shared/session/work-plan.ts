// 段取り（`work_plan` ツールで受け取る段の並びと今の位置）の形と、記録から段取りを導く決まり。
// 状態に別の入れ物は持たず、`work-plan` の記録から描くたびに導く。

import { isPlainObject } from "remeda"

import { leadingSentences, sentenceCount } from "../report/sentence-count.ts"
import { isBlankText } from "../utils/blank-text.ts"
import type { DelegateReturn } from "./delegate-return.ts"
import type { SessionRecord } from "./session-state.ts"

/** 段のまとまり。同時に走る段の名前の並びで、{@link MIN_PHASE_GROUP_SIZE} 個以上の重ならない名前を持つ。 */
export type PhaseGroup = readonly string[]

export type WorkPlanEntry = string | PhaseGroup

/**
 * 段の並びと今の位置。
 * `current` は要素の0始まりの位置で、全部の段が済んだら `phases.length`。
 * `finishedInGroup` は `current` が指すまとまりの中で済んだ段の名前で、まとまりを指していなければ空。
 * `phaseSummary` は終えた段のまとめ（段のまとめ）で、無ければ空の文字列。
 * `delegatedRange` は委譲先の段の範囲で、委譲しなければ `none`。
 */
export type WorkPlan = {
  readonly phases: readonly WorkPlanEntry[]
  readonly current: number
  readonly finishedInGroup: readonly string[]
  readonly phaseSummary: string
  readonly delegatedRange: DelegatedRange
}

/**
 * 委譲先の段の範囲。`first` は委譲先の段1に当たる位置（平らにした並びで0始まり）、`count` は委譲先の段の数。
 * 委譲先の段 `n` は平らにした並びの `first + n - 1` の段に当たる。
 */
export type DelegatedRange =
  | { readonly kind: "none" }
  | { readonly kind: "range"; readonly first: number; readonly count: number }

export const NO_DELEGATED_RANGE = { kind: "none" } as const satisfies DelegatedRange

/** 段取りが持つ段の数の下限。段が無い段取りは位置を言う意味が無いので受け付けない。 */
export const MIN_WORK_PLAN_PHASES = 1

/** 段のまとまりが持つ段の数の下限。1段だけのまとまりは段と同じなので受け付けない。 */
export const MIN_PHASE_GROUP_SIZE = 2

/** 段のまとめの文の数の上限。 */
export const MAX_PHASE_SUMMARY_SENTENCES = 2

/** 記録の範囲で最後に渡された段取り。1度も渡されていなければ `none`。 */
export type LatestWorkPlan = { readonly kind: "none" } | ({ readonly kind: "planned" } & WorkPlan)

export type PlannedPhaseState = "done" | "current" | "upcoming"

/**
 * 並びを平らにした段1つ。`index` は平らにした並びでの0始まりの位置（段の番号は `index + 1`）。
 * `entry` はその段のある要素の位置で、まとまりの中の段どうしは同じ値を持つ。
 * `key` は名前と同じ名前の段の中で何番目かの組で、組み替えた並びどうしで同じ段を引き当てるのに使う。
 */
export type PlannedPhase = {
  readonly index: number
  readonly name: string
  readonly key: string
  readonly entry: number
  readonly state: PlannedPhaseState
}

/**
 * 手順1件が始まったときの段。
 * 段取りがまだ無い・全部の段が済んだあとなら `none`。
 * `indexes` は今の段（まとまりの中なら済んでいない段のすべて）の平らにした並びでの0始まりの位置、`count` は段の数、
 * `name` は今の段の名前を「・」でつないだもの。
 */
export type WorkPhase =
  | { readonly kind: "none" }
  | {
      readonly kind: "phase"
      readonly indexes: readonly number[]
      readonly count: number
      readonly name: string
    }

/**
 * `work_plan` の呼び出し1つで段が移ったか。
 * `finished` は終えた段（見出しの字）とそのまとめで、中間レポートになる。
 */
export type PhaseShift = {
  readonly finished:
    | { readonly kind: "none" }
    | { readonly kind: "finished"; readonly label: string; readonly summary: string }
}

/**
 * 外来の値（ツールの引数・transcript）を段取りとして読む。
 * 次のどれかなら undefined:
 * 要素が {@link MIN_WORK_PLAN_PHASES} 個より少ない・空白だけの名前がある・
 * まとまりの段が {@link MIN_PHASE_GROUP_SIZE} 個より少ないか名前が重なる・位置が0から要素の数までの整数でない・
 * `finishedInGroup` が今のまとまりの重ならない名前の一部でない・
 * 段のまとめが {@link MAX_PHASE_SUMMARY_SENTENCES} 文を超える・
 * 委譲先の段の範囲が整数でない・並びをはみ出す・段のまとまりの端をまたぐ。
 * 途中なのに段のまとめが無いことは、返却で進んだ位置を同じまま渡す呼び出しがあるので、ここでは見ない（`WorkPlanReview` が見る）。
 * ツールの handler が差し戻すかどうかと、変換がイベントにするかどうかは、この1つで決まる。
 */
export function parseWorkPlan(value: unknown): WorkPlan | undefined {
  if (!isPlainObject(value) || !Array.isArray(value.phases)) {
    return undefined
  }
  const phases = value.phases.flatMap((entry: unknown): readonly WorkPlanEntry[] => {
    const parsed = parseEntry(entry)
    return parsed === undefined ? [] : [parsed]
  })
  const { current } = value
  if (
    phases.length !== value.phases.length ||
    phases.length < MIN_WORK_PLAN_PHASES ||
    typeof current !== "number" ||
    !Number.isInteger(current) ||
    current < 0 ||
    current > phases.length
  ) {
    return undefined
  }
  const finishedInGroup = parseFinishedInGroup(value.finishedInGroup, phases[current])
  const phaseSummary = parsePhaseSummary(value.phaseSummary)
  const delegatedRange = parseDelegatedRange(value.delegatedRange, phases)
  if (
    finishedInGroup === undefined ||
    phaseSummary === undefined ||
    delegatedRange === undefined ||
    sentenceCount(phaseSummary) > MAX_PHASE_SUMMARY_SENTENCES
  ) {
    return undefined
  }
  return { phases, current, finishedInGroup, phaseSummary, delegatedRange }
}

/** 途中（済んだ段が1つ以上あり、全部は済んでいない）か。 */
export function isMidWay(plan: Pick<WorkPlan, "phases" | "current" | "finishedInGroup">): boolean {
  const finished = finishedPhaseCount(plan)
  return finished > 0 && finished < phaseCount(plan.phases)
}

/** 返却を受けて段取りを進めた結果。`held` は帯を動かさない。 */
export type ReturnAdvance =
  | { readonly kind: "held" }
  | { readonly kind: "advanced"; readonly plan: WorkPlan }

/**
 * 委譲の返却 `段 n/N` で、覚えている段取りを進めた結果。
 * 範囲があり `N` が範囲の段の数と同じで、段 `n` に当たる段が今の段の集合に入っているときだけ、その段を済ませる。
 * 一足飛び・済んだ段・範囲の無い段取り・`計画`・`止めた`・形の読めない返却・並びの最後の段（返却では全部済みにしない）は動かさない。
 * 段のまとめは返却の要約を {@link MAX_PHASE_SUMMARY_SENTENCES} 文で切り詰めたもの。
 */
export function advancedByReturn(plan: WorkPlan, handback: DelegateReturn): ReturnAdvance {
  if (
    handback.kind !== "phase-done" ||
    plan.delegatedRange.kind !== "range" ||
    plan.delegatedRange.count !== handback.count
  ) {
    return HELD
  }
  const target = plan.delegatedRange.first + handback.phase - 1
  const phase = plannedPhasesOf(plan).find((candidate) => candidate.index === target)
  if (phase === undefined || phase.state !== "current") {
    return HELD
  }
  const entry = plan.phases[phase.entry]
  const finishedInGroup = typeof entry === "string" ? [] : [...plan.finishedInGroup, phase.name]
  const entryDone =
    entry === undefined || typeof entry === "string" || finishedInGroup.length === entry.length
  const advanced: WorkPlan = {
    ...plan,
    current: entryDone ? plan.current + 1 : plan.current,
    finishedInGroup: entryDone ? [] : finishedInGroup,
    phaseSummary: leadingSentences(handback.summary, MAX_PHASE_SUMMARY_SENTENCES),
  }
  return finishedPhaseCount(advanced) >= phaseCount(advanced.phases)
    ? HELD
    : { kind: "advanced", plan: advanced }
}

const HELD = { kind: "held" } as const satisfies ReturnAdvance

/** 並びを平らにした段（{@link PlannedPhase}）。読み順に並ぶ。 */
export function plannedPhasesOf(
  plan: Pick<WorkPlan, "phases" | "current" | "finishedInGroup">,
): readonly PlannedPhase[] {
  const flattened = plan.phases.flatMap((entry, position) =>
    entryNames(entry).map((name) => ({ position, name })),
  )
  return flattened.map(({ position, name }, index): PlannedPhase => {
    const occurrence = flattened.slice(0, index).filter((other) => other.name === name).length
    return {
      index,
      name,
      key: `${name}\u0000${String(occurrence)}`,
      entry: position,
      state: entryPhaseState(plan, position, name),
    }
  })
}

/** 段の数（並びを平らにして数える）。 */
export function phaseCount(phases: readonly WorkPlanEntry[]): number {
  return phases.reduce((total, entry) => total + entryNames(entry).length, 0)
}

/** 済んだ段の数（並びを平らにして数える）。 */
export function finishedPhaseCount(
  plan: Pick<WorkPlan, "phases" | "current" | "finishedInGroup">,
): number {
  return phaseCount(plan.phases.slice(0, plan.current)) + plan.finishedInGroup.length
}

/**
 * サーバが `work_plan` を判定したあとの、いまの段取りの立ち位置（`WorkPlanReview.standing`）。
 * `rejected` はこのターンで差し戻した呼び出しに、まだ受け付けた呼び出しで応えていない。
 * `planned` は同じ依頼で受け付けた段取りがあり、`remaining` はまだ済んでいない段の数（全部済みなら 0）。
 */
export type WorkPlanStanding =
  | { readonly kind: "none" }
  | { readonly kind: "rejected" }
  | { readonly kind: "planned"; readonly remaining: number }

/** 段取りを判定しない口（疑似セッション）が渡す立ち位置。 */
export const NO_WORK_PLAN_STANDING = { kind: "none" } as const satisfies WorkPlanStanding

/** `report` の欄 `workPlanClosing` で渡せる段の閉じ方。`finished` は全部の段を終えた、`stopped` は途中で止めた。 */
export const WORK_PLAN_CLOSINGS = ["finished", "stopped"] as const

/** `report` が渡した段の閉じ方。欄の無い `report` と、欄を持たなかったころの記録は `none`。 */
export type WorkPlanClosing = "none" | (typeof WORK_PLAN_CLOSINGS)[number]

/** `report` の引数の `workPlanClosing` を読む。「無い」と形の崩れは `none` に畳む。 */
export function parseWorkPlanClosing(value: unknown): WorkPlanClosing {
  return WORK_PLAN_CLOSINGS.find((closing) => closing === value) ?? "none"
}

/** `finished` の `report` 1回で段取りがどうなるか。`held` は段を動かさない。 */
export type ReportClose =
  | { readonly kind: "held" }
  | { readonly kind: "closed"; readonly plan: WorkPlan }

/**
 * `finished` の `report` 1回で閉じた段取り（{@link ReportClose}）。
 * 残りが1段のときだけ、段の並びはそのままで全部の段を終えた位置にする（最後の段のまとめは最終レポートが担うので持たない）。
 * 段が2つ以上残っている・全部の段を終えた位置からは動かさない。
 */
export function closedByReport(plan: WorkPlan): ReportClose {
  return phaseCount(plan.phases) - finishedPhaseCount(plan) === 1
    ? {
        kind: "closed",
        plan: {
          phases: plan.phases,
          current: plan.phases.length,
          finishedInGroup: [],
          phaseSummary: "",
          delegatedRange: plan.delegatedRange,
        },
      }
    : { kind: "held" }
}

/** 記録の範囲で最後の `work-plan` の記録（{@link LatestWorkPlan}）。範囲を依頼1つに絞るのは呼ぶ側。 */
export function latestWorkPlan(records: readonly SessionRecord[]): LatestWorkPlan {
  const found = records.findLast(isWorkPlanRecord)
  return found === undefined ? { kind: "none" } : workPlanOf(found)
}

/** `work-plan` の記録1件が運ぶ段取り。 */
export function workPlanOf(
  record: Extract<SessionRecord, { readonly kind: "work-plan" }>,
): LatestWorkPlan {
  return {
    kind: "planned",
    phases: record.phases,
    current: record.current,
    finishedInGroup: record.finishedInGroup,
    phaseSummary: record.phaseSummary,
    delegatedRange: record.delegatedRange,
  }
}

export function isWorkPlanRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "work-plan" }> {
  return record.kind === "work-plan"
}

/** 段取りの今の段（{@link WorkPhase}）。 */
export function currentPhaseOf(plan: LatestWorkPlan): WorkPhase {
  if (plan.kind === "none") {
    return { kind: "none" }
  }
  const phases = plannedPhasesOf(plan)
  const current = phases.filter((phase) => phase.state === "current")
  return current.length === 0
    ? { kind: "none" }
    : {
        kind: "phase",
        indexes: current.map((phase) => phase.index),
        count: phases.length,
        name: current.map((phase) => phase.name).join(PHASE_NAME_SEPARATOR),
      }
}

/**
 * 同じ依頼の中の前の段取り `previous` から `next` へ移ったときに、メインビューに出すもの（{@link PhaseShift}）。
 *
 * - 依頼で最初の段取りと、全部の段を終えた段取りでは何も出さない（最後の段のまとめは最終レポートが担う）
 * - 中間レポートは、前の今の段のどれかが新しい並びで済んだ段になったときだけ出す。
 *   段は名前と同じ名前の段の中で何番目かで探すので、段を進めながら後ろの段を組み替えても終えた段を見失わず、
 *   同じ名前の済んだ段を今の段と取り違えない。
 *   戻った・組み替えただけで前の今の段が済んでいない（今の段以降にある・並びから消えた）ときは出さない
 */
export function phaseShiftOf(previous: LatestWorkPlan, next: WorkPlan): PhaseShift {
  if (previous.kind === "none" || currentPhaseOf({ kind: "planned", ...next }).kind === "none") {
    return NO_PHASE_SHIFT
  }
  const nextPhases = plannedPhasesOf(next)
  const finished = plannedPhasesOf(previous)
    .filter((phase) => phase.state === "current")
    .map((phase) => nextPhases.find((candidate) => candidate.key === phase.key))
    .find((found) => found?.state === "done")
  if (finished === undefined || isBlankText(next.phaseSummary)) {
    return NO_PHASE_SHIFT
  }
  return {
    finished: {
      kind: "finished",
      label: phaseLabel({
        kind: "phase",
        indexes: [finished.index],
        count: nextPhases.length,
        name: finished.name,
      }),
      summary: next.phaseSummary,
    },
  }
}

/** 段の見出し「2/4 段の名前」（今の段が2つ以上なら「2·3/4 段B・段C」）。 */
export function phaseLabel(phase: Extract<WorkPhase, { readonly kind: "phase" }>): string {
  return `${phasePosition(phase)} ${phase.name}`
}

/** 段の位置「2/4」（今の段が2つ以上なら「2·3/4」）。 */
export function phasePosition(phase: Extract<WorkPhase, { readonly kind: "phase" }>): string {
  return `${phase.indexes.map((index) => String(index + 1)).join("·")}/${String(phase.count)}`
}

const PHASE_NAME_SEPARATOR = "・"

const NO_PHASE_SHIFT = {
  finished: { kind: "none" },
} as const satisfies PhaseShift

function entryNames(entry: WorkPlanEntry): readonly string[] {
  return typeof entry === "string" ? [entry] : entry
}

function entryPhaseState(
  plan: Pick<WorkPlan, "current" | "finishedInGroup">,
  position: number,
  name: string,
): PlannedPhaseState {
  if (position < plan.current) {
    return "done"
  }
  if (position > plan.current) {
    return "upcoming"
  }
  return plan.finishedInGroup.includes(name) ? "done" : "current"
}

/** 並びの要素1つを読む。空白だけの名前・小さすぎるまとまり・名前の重なるまとまりなら undefined。 */
function parseEntry(entry: unknown): WorkPlanEntry | undefined {
  if (typeof entry === "string") {
    return isBlankText(entry) ? undefined : entry
  }
  if (!Array.isArray(entry)) {
    return undefined
  }
  const names = entry.filter(
    (name): name is string => typeof name === "string" && !isBlankText(name),
  )
  return names.length === entry.length &&
    names.length >= MIN_PHASE_GROUP_SIZE &&
    new Set(names).size === names.length
    ? names
    : undefined
}

/**
 * `finishedInGroup` を読む。無ければ空。
 * 今の要素がまとまりでないなら空でなければならず、まとまりなら重ならないその中の名前で、全部ではないこと。
 */
function parseFinishedInGroup(
  value: unknown,
  currentEntry: WorkPlanEntry | undefined,
): readonly string[] | undefined {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  const names = value.filter((name): name is string => typeof name === "string")
  if (names.length !== value.length) {
    return undefined
  }
  if (names.length === 0) {
    return names
  }
  return currentEntry !== undefined &&
    typeof currentEntry !== "string" &&
    names.length < currentEntry.length &&
    new Set(names).size === names.length &&
    names.every((name) => currentEntry.includes(name))
    ? names
    : undefined
}

/**
 * 委譲先の段の範囲を読む。無ければ `none`。
 * 整数でない・`count` が1未満・並びをはみ出す・範囲の端が段のまとまりの中にある（まとまりをまたぐ）なら undefined。
 */
function parseDelegatedRange(
  value: unknown,
  phases: readonly WorkPlanEntry[],
): DelegatedRange | undefined {
  if (value === undefined) {
    return NO_DELEGATED_RANGE
  }
  if (!isPlainObject(value)) {
    return undefined
  }
  const { first, count } = value
  if (
    typeof first !== "number" ||
    typeof count !== "number" ||
    !Number.isInteger(first) ||
    !Number.isInteger(count) ||
    first < 0 ||
    count < 1 ||
    first + count > phaseCount(phases)
  ) {
    return undefined
  }
  const boundaries = new Set(
    phases.reduce<readonly number[]>(
      (starts, entry) => [...starts, (starts.at(-1) ?? 0) + entryNames(entry).length],
      [0],
    ),
  )
  return boundaries.has(first) && boundaries.has(first + count)
    ? { kind: "range", first, count }
    : undefined
}

/** 段のまとめを読む。無い・空白だけなら空の文字列、文字列でなければ undefined。 */
function parsePhaseSummary(value: unknown): string | undefined {
  if (value === undefined) {
    return ""
  }
  if (typeof value !== "string") {
    return undefined
  }
  return isBlankText(value) ? "" : value
}
