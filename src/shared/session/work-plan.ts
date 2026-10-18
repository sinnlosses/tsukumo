// ワークプラン（`work_plan` ツールで受け取る段の並びと今の位置）の形と、引数の検証、並びを平らにした段と今の段を導く決まり。

import { z } from "zod"

import { sentenceCount } from "../report/sentence-count.ts"
import { isBlankText } from "../utils/blank-text.ts"

/** 並列の段。同時に走る段の名前の並びで、{@link MIN_PHASE_GROUP_SIZE} 個以上の重ならない名前を持つ。 */
export type PhaseGroup = readonly string[]

export type WorkPlanEntry = string | PhaseGroup

/**
 * 段の並びと今の位置。
 * `current` は要素の0始まりの位置で、全部の段が済んだら `phases.length`。
 * `finishedInGroup` は `current` が指す並列の段の中で済んだ段の名前で、並列の段を指していなければ空。
 * `phaseSummary` は終えた段のまとめ（段のまとめ）で、無ければ空の文字列。
 * `delegatedRange` は委譲先の段の範囲で、委譲しなければ `none`。
 * `skippedPhases` は済んだ段のうち飛ばした段の名前（同じ名前の段は見分けない）。
 * `awaitingSummary` はまとめ待ちの段（{@link AwaitingSummary}）。
 */
export type WorkPlan = {
  readonly phases: readonly WorkPlanEntry[]
  readonly current: number
  readonly finishedInGroup: readonly string[]
  readonly phaseSummary: string
  readonly delegatedRange: DelegatedRange
  readonly skippedPhases: readonly string[]
  readonly awaitingSummary: AwaitingSummary
}

/**
 * 委譲の返却で済んだが段のまとめが空の段。`key` は {@link PlannedPhase} の `key`。
 * 返却で進めたワークプランだけが `awaiting` を持ち、`work_plan` の呼び出しから読んだワークプランはいつも `none`。
 */
export type AwaitingSummary =
  | { readonly kind: "none" }
  | { readonly kind: "awaiting"; readonly key: string }

export const NO_AWAITING_SUMMARY = { kind: "none" } as const satisfies AwaitingSummary

/**
 * 委譲先の段の範囲。`first` は委譲先の段1に当たる位置（平らにした並びで0始まり）、`count` は委譲先の段の数。
 * 委譲先の段 `n` は平らにした並びの `first + n - 1` の段に当たる。
 * `pending` は `first` だけが決まり、`count` が未定の間（計画の返却を待つ間）で、どの段にも番号を付けない。
 */
export type DelegatedRange =
  | { readonly kind: "none" }
  | { readonly kind: "pending"; readonly first: number }
  | { readonly kind: "range"; readonly first: number; readonly count: number }

export const NO_DELEGATED_RANGE = { kind: "none" } as const satisfies DelegatedRange

/** ワークプランが持つ段の数の下限。段が無いワークプランは位置を言う意味が無いので受け付けない。 */
const MIN_WORK_PLAN_PHASES = 1

/** 並列の段が持つ段の数の下限。1段だけの並列の段は段と同じなので受け付けない。 */
const MIN_PHASE_GROUP_SIZE = 2

/** 段のまとめの文の数の上限。 */
export const MAX_PHASE_SUMMARY_SENTENCES = 2

/** 記録の範囲で最後に渡されたワークプラン。1度も渡されていなければ `none`。 */
export type LatestWorkPlan = { readonly kind: "none" } | PlannedWorkPlan

export type PlannedWorkPlan = { readonly kind: "planned" } & WorkPlan

export type PlannedPhaseState = "done" | "current" | "upcoming"

/**
 * 並びを平らにした段1つ。`index` は平らにした並びでの0始まりの位置（段の番号は `phaseNumberOf` が導く）。
 * `entry` はその段のある要素の位置で、並列の段の中の段どうしは同じ値を持つ。
 * `key` は名前と同じ名前の段の中で何番目かの組で、組み替えた並びどうしで同じ段を引き当てるのに使う。
 */
export type PlannedPhase = {
  readonly index: number
  readonly name: string
  readonly key: string
  readonly entry: number
  readonly state: PlannedPhaseState
  /** 済んだ段のうち飛ばした段（名前が `skippedPhases` にある）。済んでいない段はいつも false。 */
  readonly skipped: boolean
}

/**
 * 手順1件が始まったときの段。
 * ワークプランがまだ無い・全部の段が済んだあとなら `none`。
 * `indexes` は今の段（並列の段の中なら済んでいない段のすべて）の平らにした並びでの0始まりの位置、`count` は段の数、
 * `name` は今の段の名前を「・」でつないだもの、`range` はワークプランの委譲先の段の範囲（番号の数え方を決める）。
 */
export type WorkPhase =
  | { readonly kind: "none" }
  | {
      readonly kind: "phase"
      readonly indexes: readonly number[]
      readonly count: number
      readonly name: string
      readonly range: DelegatedRange
    }

const phaseNameSchema = z.string().refine((name) => !isBlankText(name))

/**
 * `work_plan` の引数の欄。ツールはこの欄に説明文を足して渡す。
 * 欄をまたぐ検査は {@link workPlanSchema} が持つ。
 */
export const workPlanShape = {
  phases: z
    .array(z.union([phaseNameSchema, z.array(phaseNameSchema).min(MIN_PHASE_GROUP_SIZE)]))
    .min(MIN_WORK_PLAN_PHASES),
  current: z.number().int().min(0),
  finishedInGroup: z.array(z.string()).optional(),
  phaseSummary: z.string().optional(),
  delegatedRange: z
    .object({ first: z.number().int().min(0), count: z.number().int().min(1).optional() })
    .optional(),
  skippedPhases: z.array(phaseNameSchema).optional(),
}

/**
 * `work_plan` の引数の形の正典。
 * 次のどれかなら通らない:
 * 要素が {@link MIN_WORK_PLAN_PHASES} 個より少ない・空白だけの名前がある・
 * 並列の段の中の段が {@link MIN_PHASE_GROUP_SIZE} 個より少ないか名前が重なる・位置が0から要素の数までの整数でない・
 * `finishedInGroup` が今の並列の段の重ならない名前の一部でない・
 * 段のまとめが {@link MAX_PHASE_SUMMARY_SENTENCES} 文を超える・
 * 委譲先の段の範囲が整数でない・並びをはみ出す・並列の段の端をまたぐ・
 * 飛ばした段の名前が重なるか、この呼び出しで済んでいる段の名前でない。
 * 途中なのに段のまとめが無いことは、ここでは見ず `WorkPlanReview` が `summary-missing` で差し戻す。
 */
export const workPlanSchema = z.object(workPlanShape).superRefine((value, context) => {
  const {
    phases,
    current,
    finishedInGroup = [],
    phaseSummary = "",
    delegatedRange,
    skippedPhases = [],
  } = value
  const reject = (path: string): void => {
    context.addIssue({ code: "custom", message: "invalid work plan", path: [path] })
  }
  if (phases.some((entry) => typeof entry !== "string" && new Set(entry).size !== entry.length)) {
    reject("phases")
  }
  if (current > phases.length) {
    reject("current")
  }
  if (finishedInGroup.length > 0) {
    const currentEntry = phases[current]
    if (
      currentEntry === undefined ||
      typeof currentEntry === "string" ||
      finishedInGroup.length >= currentEntry.length ||
      new Set(finishedInGroup).size !== finishedInGroup.length ||
      !finishedInGroup.every((name) => currentEntry.includes(name))
    ) {
      reject("finishedInGroup")
    }
  }
  if (!isBlankText(phaseSummary) && sentenceCount(phaseSummary) > MAX_PHASE_SUMMARY_SENTENCES) {
    reject("phaseSummary")
  }
  if (delegatedRange !== undefined) {
    const { first, count } = delegatedRange
    const boundaries = entryBoundaries(phases)
    const end = first + (count ?? 0)
    if (end > phaseCount(phases) || !boundaries.has(first) || !boundaries.has(end)) {
      reject("delegatedRange")
    }
  }
  if (skippedPhases.length > 0) {
    const finishedNames = finishedPhaseNames({ phases, current, finishedInGroup })
    if (
      new Set(skippedPhases).size !== skippedPhases.length ||
      !skippedPhases.every((name) => finishedNames.has(name))
    ) {
      reject("skippedPhases")
    }
  }
})

/**
 * 外来の値（ツールの引数・transcript）をワークプランとして読む。{@link workPlanSchema} を通らなければ undefined。
 * ツールの handler が差し戻すかどうかと、変換がイベントにするかどうかは、この1つで決まる。
 */
export function parseWorkPlan(value: unknown): WorkPlan | undefined {
  const parsed = workPlanSchema.safeParse(value)
  if (!parsed.success) {
    return undefined
  }
  const {
    phases,
    current,
    finishedInGroup = [],
    phaseSummary = "",
    delegatedRange,
    skippedPhases = [],
  } = parsed.data
  return {
    phases,
    current,
    finishedInGroup,
    phaseSummary: isBlankText(phaseSummary) ? "" : phaseSummary,
    delegatedRange: delegatedRangeOf(delegatedRange),
    skippedPhases,
    awaitingSummary: NO_AWAITING_SUMMARY,
  }
}

/** 途中（済んだ段が1つ以上あり、全部は済んでいない）か。 */
export function isMidWay(plan: Pick<WorkPlan, "phases" | "current" | "finishedInGroup">): boolean {
  const finished = finishedPhaseCount(plan)
  return finished > 0 && finished < phaseCount(plan.phases)
}

/** 並びを平らにした段（{@link PlannedPhase}）。読み順に並ぶ。 */
export function plannedPhasesOf(
  plan: Pick<WorkPlan, "phases" | "current" | "finishedInGroup" | "skippedPhases">,
): readonly PlannedPhase[] {
  const { skippedPhases } = plan
  const flattened = plan.phases.flatMap((entry, position) =>
    entryNames(entry).map((name) => ({ position, name })),
  )
  return flattened.map(({ position, name }, index): PlannedPhase => {
    const occurrence = flattened.slice(0, index).filter((other) => other.name === name).length
    const state = entryPhaseState(plan, position, name)
    return {
      index,
      name,
      key: `${name}\u0000${String(occurrence)}`,
      entry: position,
      state,
      skipped: state === "done" && skippedPhases.includes(name),
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

/** 済んだ段の名前。 */
export function finishedPhaseNames(
  plan: Pick<WorkPlan, "phases" | "current" | "finishedInGroup">,
): ReadonlySet<string> {
  return new Set(
    plannedPhasesOf({ ...plan, skippedPhases: [] })
      .filter((phase) => phase.state === "done")
      .map((phase) => phase.name),
  )
}

/**
 * サーバが `work_plan` を判定したあとの、いまのワークプランの立ち位置（`WorkPlanReview.standing`）。
 * `rejected` はこのターンで差し戻した呼び出しに、まだ受け付けた呼び出しで応えていない。
 * `planned` は同じ依頼で受け付けたワークプランがあり、`remaining` はまだ済んでいない段の数（全部済みなら 0）。
 */
export type WorkPlanStanding =
  | { readonly kind: "none" }
  | { readonly kind: "rejected" }
  | { readonly kind: "planned"; readonly remaining: number }

/** `report` の欄 `workPlanClosing` で渡せる段の閉じ方。`finished` は全部の段を終えた、`stopped` は途中で止めた。 */
export const WORK_PLAN_CLOSINGS = ["finished", "stopped"] as const

/** `report` が渡した段の閉じ方。欄の無い `report` と、欄を持たなかったころの記録は `none`。 */
export type WorkPlanClosing = "none" | (typeof WORK_PLAN_CLOSINGS)[number]

/** `report` の引数の `workPlanClosing` を読む。「無い」と形の崩れは `none` に畳む。 */
export function parseWorkPlanClosing(value: unknown): WorkPlanClosing {
  return WORK_PLAN_CLOSINGS.find((closing) => closing === value) ?? "none"
}

/** ワークプランの今の段（{@link WorkPhase}）。 */
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
        range: plan.delegatedRange,
      }
}

const PHASE_NAME_SEPARATOR = "・"

function delegatedRangeOf(value: z.infer<typeof workPlanShape.delegatedRange>): DelegatedRange {
  if (value === undefined) {
    return NO_DELEGATED_RANGE
  }
  return value.count === undefined
    ? { kind: "pending", first: value.first }
    : { kind: "range", first: value.first, count: value.count }
}

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

/** 並びの要素の切れ目（平らにした並びでの位置）。先頭の0と、各要素の終わり。 */
function entryBoundaries(phases: readonly WorkPlanEntry[]): ReadonlySet<number> {
  return new Set(
    phases.reduce<readonly number[]>(
      (starts, entry) => [...starts, (starts.at(-1) ?? 0) + entryNames(entry).length],
      [0],
    ),
  )
}
