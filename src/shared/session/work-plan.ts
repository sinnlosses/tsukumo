// 段取り（`work_plan` ツールで受け取る段の並びと今の位置）の形と、記録から段取りを導く決まり。
// 状態に別の入れ物は持たず、`work-plan` の記録から描くたびに導く。

import { z } from "zod"

import { leadingSentences, sentenceCount } from "../report/sentence-count.ts"
import { isBlankText } from "../utils/blank-text.ts"
import type { DelegateReturn } from "./delegate-return.ts"
import type { SessionEvent } from "./session-event.ts"
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
 * 返却で進めた段取りだけが `awaiting` を持ち、`work_plan` の呼び出しから読んだ段取りはいつも `none`。
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

/** 段取りが持つ段の数の下限。段が無い段取りは位置を言う意味が無いので受け付けない。 */
export const MIN_WORK_PLAN_PHASES = 1

/** 段のまとまりが持つ段の数の下限。1段だけのまとまりは段と同じなので受け付けない。 */
export const MIN_PHASE_GROUP_SIZE = 2

/** 段のまとめの文の数の上限。 */
export const MAX_PHASE_SUMMARY_SENTENCES = 2

/** 記録の範囲で最後に渡された段取り。1度も渡されていなければ `none`。 */
export type LatestWorkPlan = { readonly kind: "none" } | PlannedWorkPlan

type PlannedWorkPlan = { readonly kind: "planned" } & WorkPlan

export type PlannedPhaseState = "done" | "current" | "upcoming"

/**
 * 並びを平らにした段1つ。`index` は平らにした並びでの0始まりの位置（段の番号は {@link phaseNumberOf} が導く）。
 * `entry` はその段のある要素の位置で、まとまりの中の段どうしは同じ値を持つ。
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
 * 段取りがまだ無い・全部の段が済んだあとなら `none`。
 * `indexes` は今の段（まとまりの中なら済んでいない段のすべて）の平らにした並びでの0始まりの位置、`count` は段の数、
 * `name` は今の段の名前を「・」でつないだもの、`range` は段取りの委譲先の段の範囲（番号の数え方を決める）。
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

/**
 * `work_plan` の呼び出し1つで段が移ったか。
 * `finished` は終えた段（見出しの字）とそのまとめで、中間レポートになる。
 */
export type PhaseShift = {
  readonly finished:
    | { readonly kind: "none" }
    | {
        readonly kind: "finished"
        readonly label: string
        readonly summary: string
        readonly skipped: boolean
      }
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
 * まとまりの段が {@link MIN_PHASE_GROUP_SIZE} 個より少ないか名前が重なる・位置が0から要素の数までの整数でない・
 * `finishedInGroup` が今のまとまりの重ならない名前の一部でない・
 * 段のまとめが {@link MAX_PHASE_SUMMARY_SENTENCES} 文を超える・
 * 委譲先の段の範囲が整数でない・並びをはみ出す・段のまとまりの端をまたぐ・
 * 飛ばした段の名前が重なるか、この呼び出しで済んでいる段の名前でない。
 * 途中なのに段のまとめが無いことは、ここでは見ず `WorkPlanReview` が `malformed` で差し戻す。
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
 * 外来の値（ツールの引数・transcript）を段取りとして読む。{@link workPlanSchema} を通らなければ undefined。
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
 * サーバが `work_plan` を判定したあとの、いまの段取りの立ち位置（`WorkPlanReview.standing`）。
 * `rejected` はこのターンで差し戻した呼び出しに、まだ受け付けた呼び出しで応えていない。
 * `planned` は同じ依頼で受け付けた段取りがあり、`remaining` はまだ済んでいない段の数（全部済みなら 0）。
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

/** 今の段取りを動かすイベント。ほかのイベント（`turn-started` も）は段取りを動かさない。 */
export type WorkPlanEvent = Extract<
  SessionEvent,
  { readonly kind: "request" | "work-plan" | "delegate-returned" | "report" }
>

/**
 * イベント1件を受けたあとの今の段取り。
 * 依頼で忘れ、`work-plan` で置き換え、委譲の返却は {@link advancedByReturn}、段の閉じ方が `finished` の `report` は {@link closedByReport} で畳む。
 */
export function nextWorkPlan(plan: LatestWorkPlan, event: WorkPlanEvent): LatestWorkPlan {
  switch (event.kind) {
    case "request":
      return NO_WORK_PLAN
    case "work-plan":
      return withLeadPhasesFinished(plan, workPlanOf(event))
    case "delegate-returned":
      return plan.kind === "none" ? plan : advancedByReturn(plan, event.handback)
    case "report":
      return plan.kind === "none" || event.workPlanClosing !== "finished"
        ? plan
        : closedByReport(plan)
  }
}

/** 記録の並びから畳んだ今の段取り。記録に残る `request` と `work-plan` を {@link nextWorkPlan} に通す。 */
export function currentWorkPlan(records: readonly SessionRecord[]): LatestWorkPlan {
  return records.reduce<LatestWorkPlan>(
    (plan, record) =>
      record.kind === "request" || record.kind === "work-plan" ? nextWorkPlan(plan, record) : plan,
    NO_WORK_PLAN,
  )
}

const NO_WORK_PLAN = { kind: "none" } as const satisfies LatestWorkPlan

/** `work-plan` のイベントか記録1件が運ぶ段取り（段取りの欄だけを拾う）。 */
export function workPlanOf(plan: WorkPlan): PlannedWorkPlan {
  return {
    kind: "planned",
    phases: plan.phases,
    current: plan.current,
    finishedInGroup: plan.finishedInGroup,
    phaseSummary: plan.phaseSummary,
    delegatedRange: plan.delegatedRange,
    skippedPhases: plan.skippedPhases,
    awaitingSummary: plan.awaitingSummary,
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
        range: plan.delegatedRange,
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
 * - そのほか、前の段取りのまとめ待ちの段が新しい並びで済んでいれば、新しいまとめをその段の中間レポートにする
 */
export function phaseShiftOf(previous: LatestWorkPlan, next: WorkPlan): PhaseShift {
  const shifted = shiftedPhaseOf(previous, next)
  if (shifted.kind === "none") {
    return NO_PHASE_SHIFT
  }
  return {
    finished: {
      kind: "finished",
      label: phaseLabel({
        kind: "phase",
        indexes: [shifted.phase.index],
        count: phaseCount(next.phases),
        name: shifted.phase.name,
        range: next.delegatedRange,
      }),
      summary: shifted.summary,
      skipped: shifted.phase.skipped,
    },
  }
}

/**
 * `previous` から `next` へ移ったときに済んだ段（`next` の並びの段）とそのまとめ。
 * 出す・出さないの条件は {@link phaseShiftOf} と同じで、出さないときは `none`。
 */
export function shiftedPhaseOf(
  previous: LatestWorkPlan,
  next: WorkPlan,
):
  | { readonly kind: "none" }
  | { readonly kind: "finished"; readonly phase: PlannedPhase; readonly summary: string } {
  if (previous.kind === "none" || currentPhaseOf({ kind: "planned", ...next }).kind === "none") {
    return NO_SHIFTED_PHASE
  }
  const nextPhases = plannedPhasesOf(next)
  const finishedNow = plannedPhasesOf(previous)
    .filter((phase) => phase.state === "current")
    .map((phase) => nextPhases.find((candidate) => candidate.key === phase.key))
    .find((found) => found?.state === "done")
  const { awaitingSummary } = previous
  const finished =
    finishedNow ??
    (awaitingSummary.kind === "awaiting"
      ? nextPhases.find(
          (candidate) => candidate.key === awaitingSummary.key && candidate.state === "done",
        )
      : undefined)
  if (finished === undefined || isBlankText(next.phaseSummary)) {
    return NO_SHIFTED_PHASE
  }
  return { kind: "finished", phase: finished, summary: next.phaseSummary }
}

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

/**
 * いまの位置「後 1/3」（範囲が無ければ「2/4」）。全部の段が済んでいれば最後の段の群の段の数で「後 3/3」。
 * 段取りが無い・今の段が番号を持たないときは空の文字列。
 */
export function workPositionText(plan: LatestWorkPlan): string {
  if (plan.kind === "none") {
    return ""
  }
  const phase = currentPhaseOf(plan)
  if (phase.kind === "phase") {
    return phaseNumberText(phasePosition(phase))
  }
  const total = phaseCount(plan.phases)
  const last = phaseNumberOf(plan.delegatedRange, [total - 1], total)
  return phaseNumberText(last)
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

/**
 * 委譲の返却で済む帯の段。帯を動かさない返却（{@link advancedByReturn} が `plan` をそのまま返す場合）では `unmoved`。
 */
export function phaseFinishedByReturn(plan: WorkPlan, handback: DelegateReturn): ReturnedPhase {
  const returned = returnedByReturn({ kind: "planned", ...plan }, handback)
  return returned.kind === "finished" ? { kind: "finished", phase: returned.phase } : UNMOVED
}

/** 委譲の返却1件が帯の段を済ませたか（{@link phaseFinishedByReturn}）。 */
export type ReturnedPhase =
  | { readonly kind: "unmoved" }
  | { readonly kind: "finished"; readonly phase: PlannedPhase }

const UNMOVED = { kind: "unmoved" } as const satisfies ReturnedPhase

/**
 * 範囲を初めて宣言した `work-plan` は、範囲の前の段（計画）を済ませた位置に直す。
 * 範囲の前の段は返却で済まず、範囲の先頭の段は今の段のときにしか返却で済まないので、手で `current` を進め忘れると帯が動かなくなる。
 */
function withLeadPhasesFinished(previous: LatestWorkPlan, next: PlannedWorkPlan): PlannedWorkPlan {
  const hadRange = previous.kind === "planned" && previous.delegatedRange.kind === "range"
  if (hadRange || next.delegatedRange.kind !== "range" || next.finishedInGroup.length > 0) {
    return next
  }
  const { first } = next.delegatedRange
  const lead = plannedPhasesOf(next).find((phase) => phase.index === first)
  return lead === undefined || lead.entry <= next.current ? next : { ...next, current: lead.entry }
}

/** 段のまとまりの段は平らにした並びで隣り合うので、2つ以上なら先頭と末尾の番号を「–」でつなぐ。 */
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

const PHASE_NAME_SEPARATOR = "・"

const NO_PHASE_SHIFT = {
  finished: { kind: "none" },
} as const satisfies PhaseShift

const NO_SHIFTED_PHASE = { kind: "none" } as const

/**
 * `phase_result` の `finished`（`phase-done`）と `skipped`（`phase-skipped`）で進めた段取り。
 * 範囲があり `count` が範囲の段の数と同じで、`phase` に当たる段が今の段の集合に入っているときだけ、その段を済ませる。
 * 一足飛び・済んだ段・範囲の無い段取り・`stopped`・並びの最後の段（返却では全部済みにしない）では `plan` をそのまま返す。
 * 段のまとめは返却の要約を {@link MAX_PHASE_SUMMARY_SENTENCES} 文で切り詰めたもの。まとめが空なら済ませた段をまとめ待ちにする。
 * `phase-skipped` は済ませた段の名前を飛ばした段に足す。
 */
function advancedByReturn(plan: PlannedWorkPlan, handback: DelegateReturn): PlannedWorkPlan {
  const returned = returnedByReturn(plan, handback)
  return returned.kind === "finished" ? returned.advanced : plan
}

function returnedByReturn(
  plan: PlannedWorkPlan,
  handback: DelegateReturn,
):
  | { readonly kind: "unmoved" }
  | {
      readonly kind: "finished"
      readonly phase: PlannedPhase
      readonly advanced: PlannedWorkPlan
    } {
  if (
    (handback.kind !== "phase-done" && handback.kind !== "phase-skipped") ||
    plan.delegatedRange.kind !== "range" ||
    plan.delegatedRange.count !== handback.count
  ) {
    return UNMOVED
  }
  const target = plan.delegatedRange.first + handback.phase - 1
  const phase = plannedPhasesOf(plan).find((candidate) => candidate.index === target)
  if (phase === undefined || phase.state !== "current") {
    return UNMOVED
  }
  const entry = plan.phases[phase.entry]
  const finishedInGroup = typeof entry === "string" ? [] : [...plan.finishedInGroup, phase.name]
  const entryDone =
    entry === undefined || typeof entry === "string" || finishedInGroup.length === entry.length
  const phaseSummary =
    handback.kind === "phase-done"
      ? leadingSentences(handback.summary, MAX_PHASE_SUMMARY_SENTENCES)
      : ""
  const skipped = handback.kind === "phase-skipped" && !plan.skippedPhases.includes(phase.name)
  const advanced: PlannedWorkPlan = {
    ...plan,
    current: entryDone ? plan.current + 1 : plan.current,
    finishedInGroup: entryDone ? [] : finishedInGroup,
    phaseSummary,
    skippedPhases: skipped ? [...plan.skippedPhases, phase.name] : plan.skippedPhases,
    awaitingSummary: isBlankText(phaseSummary)
      ? { kind: "awaiting", key: phase.key }
      : NO_AWAITING_SUMMARY,
  }
  return finishedPhaseCount(advanced) >= phaseCount(advanced.phases)
    ? UNMOVED
    : { kind: "finished", phase, advanced }
}

/**
 * `finished` の `report` 1回で閉じた段取り。
 * 残りが1段のときだけ、段の並びはそのままで全部の段を終えた位置にする（最後の段のまとめは最終レポートが担うので持たない）。
 * 段が2つ以上残っている・全部の段を終えた位置では `plan` をそのまま返す。
 */
function closedByReport(plan: PlannedWorkPlan): PlannedWorkPlan {
  return phaseCount(plan.phases) - finishedPhaseCount(plan) === 1
    ? {
        kind: "planned",
        phases: plan.phases,
        current: plan.phases.length,
        finishedInGroup: [],
        phaseSummary: "",
        delegatedRange: plan.delegatedRange,
        skippedPhases: plan.skippedPhases,
        awaitingSummary: NO_AWAITING_SUMMARY,
      }
    : plan
}

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
