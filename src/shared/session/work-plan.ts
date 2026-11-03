// ワークプラン（`work_plan` ツールで受け取る段の並びと今の位置）の形と、引数の検証、並びを平らにした段と今の段を導く決まり。

import { z } from "zod"

import { isBlankText } from "../utils/blank-text.ts"
import {
  hasConsistentPhaseIds,
  phaseElementSchema,
  phaseIdsOf,
  phaseNameEntriesOf,
} from "./work-plan-phase-id.ts"

/** 並列のフェーズ。同時に走る段の名前の並びで、{@link MIN_PHASE_GROUP_SIZE} 個以上の重ならない名前を持つ。 */
export type PhaseGroup = readonly string[]

export type WorkPlanEntry = string | PhaseGroup

/**
 * 段の並びと今の位置。
 * `current` は要素の0始まりの位置で、全部の段が済んだら `phases.length`。
 * `finishedInGroup` は `current` が指す並列のフェーズの中で済んだ段の名前で、並列のフェーズを指していなければ空。
 * `phaseSummary` は終えた段のまとめ（段のまとめ）で、無ければ空の文字列。
 * `delegatedRange` は委譲先のフェーズの範囲で、委譲しなければ `none`。
 * `skippedPhases` は済んだ段のうち飛ばした段の名前（同じ名前の段は見分けない）。
 * `awaitingSummary` はまとめ待ちのフェーズ（{@link AwaitingSummary}）。
 * `phaseIds` は並びを平らにした読み順の段の id で、`work_plan` が id を渡さなければ空。
 */
export type WorkPlan = {
  readonly phases: readonly WorkPlanEntry[]
  readonly phaseIds: readonly string[]
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
 * 委譲先のフェーズの範囲。`first` は委譲先のフェーズ1に当たる位置（平らにした並びで0始まり）、`count` は委譲先のフェーズの数。
 * 委譲先のフェーズ `n` は平らにした並びの `first + n - 1` の段に当たる。
 * `pending` は `first` だけが決まり、`count` が未定の間（計画の返却を待つ間）で、どの段にも番号を付けない。
 */
export type DelegatedRange =
  | { readonly kind: "none" }
  | { readonly kind: "pending"; readonly first: number }
  | { readonly kind: "range"; readonly first: number; readonly count: number }

export const NO_DELEGATED_RANGE = { kind: "none" } as const satisfies DelegatedRange

/** ワークプランが持つ段の数の下限。段が無いワークプランは位置を言う意味が無いので受け付けない。 */
const MIN_WORK_PLAN_PHASES = 1

/** 並列のフェーズが持つ段の数の下限。1段だけの並列のフェーズは段と同じなので受け付けない。 */
const MIN_PHASE_GROUP_SIZE = 2

/** 記録の範囲で最後に渡されたワークプラン。1度も渡されていなければ `none`。 */
export type LatestWorkPlan = { readonly kind: "none" } | PlannedWorkPlan

export type PlannedWorkPlan = { readonly kind: "planned" } & WorkPlan

export type PlannedPhaseState = "done" | "current" | "upcoming"

/**
 * 並びを平らにした段1つ。`index` は平らにした並びでの0始まりの位置（段の番号は `phaseNumberOf` が導く）。
 * `entry` はその段のある要素の位置で、並列のフェーズの中の段どうしは同じ値を持つ。
 * `key` は名前と同じ名前の段の中で何番目かの組で、組み替えた並びどうしで同じ段を引き当てるのに使う。
 */
export type PlannedPhase = PlannedPhaseBase &
  (
    | {
        readonly state: "done"
        /** 済んだ段のうち飛ばした段（名前が `skippedPhases` にある）。 */
        readonly skipped: boolean
      }
    | { readonly state: "current" | "upcoming"; readonly skipped: false }
  )

type PlannedPhaseBase = {
  readonly index: number
  readonly name: string
  readonly key: string
  readonly entry: number
}

/**
 * 手順1件が始まったときの段。
 * ワークプランがまだ無い・全部の段が済んだあとなら `none`。
 * `indexes` は今の段（並列のフェーズの中なら済んでいない段のすべて）の平らにした並びでの0始まりの位置、`count` は段の数、
 * `name` は今の段の名前を「・」でつないだもの、`range` はワークプランの委譲先のフェーズの範囲（番号の数え方を決める）。
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
    .array(z.union([phaseElementSchema, z.array(phaseElementSchema).min(MIN_PHASE_GROUP_SIZE)]))
    .min(MIN_WORK_PLAN_PHASES),
  current: z.number().int().min(0),
  finishedInGroup: z.array(z.string()).optional(),
  phaseSummary: z.string().optional(),
  delegatedRange: z
    .object({
      first: z.number().int().min(0).optional(),
      count: z.number().int().min(1).optional(),
    })
    .optional(),
  skippedPhases: z.array(phaseNameSchema).optional(),
}

/**
 * `work_plan` の引数の形の正典。
 * 次のどれかなら通らない:
 * 要素が {@link MIN_WORK_PLAN_PHASES} 個より少ない・空白だけの名前がある・
 * 段の id が一部の段にしか無いか、空白だけか、重なる・
 * 並列のフェーズの中の段が {@link MIN_PHASE_GROUP_SIZE} 個より少ないか名前が重なる・位置が0から要素の数までの整数でない・
 * `finishedInGroup` が今の並列のフェーズの重ならない名前の一部でない・
 * 委譲先のフェーズの範囲が整数でない・並びをはみ出す・並列のフェーズの端をまたぐ・
 * 飛ばした段の名前が重なるか、この呼び出しで済んでいる段の名前でない。
 * 途中なのに段のまとめが無いことは、ここでは見ず `WorkPlanReview` が `summary-missing` で差し戻す。
 */
const workPlanSchema = z.object(workPlanShape).superRefine((value, context) => {
  const { current, finishedInGroup = [], delegatedRange, skippedPhases = [] } = value
  const phases = phaseNameEntriesOf(value.phases)
  const reject = (path: string): void => {
    context.addIssue({ code: "custom", message: "invalid work plan", path: [path] })
  }
  if (!hasConsistentPhaseIds(value.phases)) {
    reject("phases")
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
  if (delegatedRange !== undefined) {
    const { first = current + 1, count } = delegatedRange
    if (!fitsPhases(phases, first, count ?? 0)) {
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
  return parseWorkPlanCall(value)?.plan
}

/** `work_plan` の呼び出しを読んだ結果。`firstOmitted` は範囲の `first` が省かれていたか（`plan` の `first` は今の位置の次に埋まっている）。 */
export type WorkPlanCall = { readonly plan: WorkPlan; readonly firstOmitted: boolean }

/** {@link parseWorkPlan} と同じ検査で、`first` を省いたかも残して読む。 */
export function parseWorkPlanCall(value: unknown): WorkPlanCall | undefined {
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
    plan: {
      phases: phaseNameEntriesOf(phases),
      phaseIds: phaseIdsOf(phases),
      current,
      finishedInGroup,
      phaseSummary: isBlankText(phaseSummary) ? "" : phaseSummary,
      delegatedRange: delegatedRangeOf(delegatedRange, current + 1),
      skippedPhases,
      awaitingSummary: NO_AWAITING_SUMMARY,
    },
    firstOmitted: delegatedRange?.first === undefined,
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
    const base = { index, name, key: `${name}\u0000${String(occurrence)}`, entry: position }
    return state === "done"
      ? { ...base, state, skipped: skippedPhases.includes(name) }
      : { ...base, state, skipped: false }
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

/** `report` の欄 `workPlanClosing` で渡せるフェーズの閉じ方。`finished` は全部の段を終えた、`stopped` は途中で止めた。 */
export const WORK_PLAN_CLOSINGS = ["finished", "stopped"] as const

/** `report` が渡したフェーズの閉じ方。欄の無い `report` と、欄を持たなかったころの記録は `none`。 */
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

/**
 * `work_plan` の呼び出しの範囲を確定させたワークプラン。
 * 先頭は、渡された `first` → `inherited`（受け付け済みの範囲）の `first` → 今の位置の次、の順に当てる。
 * 段の数は `returnedCount`（委譲先の返却で知らされた数）があればそれ、無ければ渡された `count`。
 * 範囲が無く返却の数も無ければ、呼び出しのまま返す。確定した範囲が並びをはみ出すか並列のフェーズの端をまたぐなら undefined。
 */
export function settleDelegatedRange(
  call: WorkPlanCall,
  inherited: DelegatedRange,
  returnedCount: number | undefined,
): WorkPlan | undefined {
  const { plan, firstOmitted } = call
  const given = plan.delegatedRange
  const count = returnedCount ?? (given.kind === "range" ? given.count : undefined)
  if (given.kind === "none" && count === undefined) {
    return plan
  }
  const first =
    given.kind !== "none" && !firstOmitted
      ? given.first
      : inherited.kind !== "none"
        ? inherited.first
        : plan.current + 1
  if (!fitsPhases(plan.phases, first, count ?? 0)) {
    return undefined
  }
  return {
    ...plan,
    delegatedRange:
      count === undefined ? { kind: "pending", first } : { kind: "range", first, count },
  }
}

function delegatedRangeOf(
  value: z.infer<typeof workPlanShape.delegatedRange>,
  defaultFirst: number,
): DelegatedRange {
  if (value === undefined) {
    return NO_DELEGATED_RANGE
  }
  const first = value.first ?? defaultFirst
  return value.count === undefined
    ? { kind: "pending", first }
    : { kind: "range", first, count: value.count }
}

function fitsPhases(phases: readonly WorkPlanEntry[], first: number, count: number): boolean {
  const boundaries = entryBoundaries(phases)
  const end = first + count
  return end <= phaseCount(phases) && boundaries.has(first) && boundaries.has(end)
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
