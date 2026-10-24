// `<WorkStrip>` のロジック。いちばん新しい依頼のワークプラン・走っている手順・答え待ち・再試行を、帯に出す形へ畳む。

import type { RefCallback, RefObject } from "react"
import { groupBy } from "remeda"

import { conversationMoment } from "../../../../../../../../../shared/session/conversation-moment.ts"
import {
  type PhaseRecap,
  phaseRecapsOf,
} from "../../../../../../../../../shared/session/phase-recap.ts"
import { reportDraftingOf } from "../../../../../../../../../shared/session/turn-progress.ts"
import {
  turnResultsOf,
  type TurnResult,
} from "../../../../../../../../../shared/session/turn-result.ts"
import {
  completionText,
  type PhaseNumber,
  phaseNumberOf,
  phaseOrdinalText,
  PHASE_SPAN_NAMES,
  type PhaseSpan,
  plannedPhaseNumber,
  plannedPhaseTitle,
  workPositionText,
} from "../../../../../../../../../shared/session/work-plan-phase-number.ts"
import {
  currentPhaseOf,
  finishedPhaseCount,
  type LatestWorkPlan,
  phaseCount,
  type PlannedPhase,
  plannedPhasesOf,
} from "../../../../../../../../../shared/session/work-plan.ts"
import { formatMeasured } from "../../../../../../../../../shared/utils/elapsed-time.ts"
import { phaseMarkOf } from "../../../../../../../../domain/phase-mark.ts"
import {
  FINISHED_LABEL,
  isTurnCounting,
  turnCountedUntil,
  turnElapsedLabel,
  turnElapsedText,
} from "../../../../../../../../domain/turn-elapsed.ts"
import {
  currentWorkStepGroups,
  type CurrentWorkStepGroup,
} from "../../../../../../../../features/current-work/domain/current-work-step.ts"
import { useNowWhile } from "../../../../../../../../stores/clock.ts"
import { useCurrentTurnSteps } from "../../../../../../../../stores/current-turn-steps.ts"
import { useMainViewContent } from "../../../../../../../../stores/main-view-content.ts"
import { useMainViewTurns } from "../../../../../../../../stores/main-view-turn.ts"
import {
  readingLabelOf,
  useReadingSection,
} from "../../../../../../../../stores/reading-section.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import {
  type StepsLanding,
  useWorkStripSteps,
} from "../../../../../../../../stores/work-strip-steps.ts"
import type { WorkStripResult } from "../../../../../domain/turn-result-mark.ts"
import { workActivityOf, type WorkActivity } from "../../../domain/work-activity.ts"
import { usePhasePopover, type PhasePopover } from "./use-phase-popover.ts"

/** 段の丸1つの状態。`asking` は今の段で答え待ちが来ているとき。 */
type WorkStripPhaseState = "done" | "current" | "asking" | "upcoming"

export type WorkStripPhase = {
  readonly key: string
  /** 丸に描く字（済んだ段は「✓」、答え待ちは「?」、ほかは段の番号）。 */
  readonly mark: string
  /** 読み上げと `title` に出す「4. 段の名前（今の段）」。 */
  readonly label: string
  readonly state: WorkStripPhaseState
  /** 済んだ段のうち飛ばした段。`state` は `done` のまま。 */
  readonly skipped: boolean
  /** 丸の外周に回る弧を付けるか。作業中の帯の今の段だけ。 */
  readonly spinning: boolean
  readonly popoverId: string
  readonly popover: WorkStripPhasePopover
  readonly onToggle: () => void
}

/**
 * 段の丸の吹き出し。`title` は「✓ 段の名前」（済んだ段）か「4. 段の名前」、`meta` は状態の行（「済み · 所要 1分40秒」など）、
 * `summary` は済んだ段の段のまとめ（無ければ空）、`toSteps` は依頼の手順の一覧のその段の区切りへ連れていく口（済んだ段だけ）。
 */
export type WorkStripPhasePopover =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly title: string
      readonly meta: string
      readonly summary: string
      readonly toSteps:
        | { readonly kind: "none" }
        | { readonly kind: "shown"; readonly onGo: () => void }
      readonly placeRef: RefCallback<HTMLDivElement>
    }

type PhaseFlags = { readonly asking: boolean; readonly spinning: boolean }

/** `recaps` は `PlannedPhase.key`（名前と何番目か）で引き、帯の丸の `key`（平らにした位置）では引かない。 */
type PopoverContext = {
  readonly popover: PhasePopover
  readonly recaps: ReadonlyMap<string, PhaseRecap>
  readonly onGo: (phase: PlannedPhase) => void
}

/**
 * 段の群の先頭の丸（と並列の段の囲み）に付ける群の名。`name` は「前」「本」「後」、`current` は今の段がその群にあるか。
 * 群の先頭でない・並び全体の群（範囲が無い）なら `none` で、前の丸と線でつなぐ。
 */
export type WorkStripSpanHead =
  | { readonly kind: "none" }
  | { readonly kind: "head"; readonly name: string; readonly current: boolean }

/** 並列の段の `state` は囲みの次の線の色だけに使い、中の段が全部済めば `done`、ほかは `upcoming`。 */
export type WorkStripSlot =
  | {
      readonly kind: "phase"
      readonly spanHead: WorkStripSpanHead
      readonly phase: WorkStripPhase
    }
  | {
      readonly kind: "parallel"
      readonly spanHead: WorkStripSpanHead
      readonly key: string
      readonly label: string
      readonly state: WorkStripPhaseState
      readonly phases: readonly WorkStripPhase[]
    }

/** 「手順 n」の口と、押すと開く依頼の手順の一覧。 */
export type WorkStripSteps = {
  /** 「手順 12 ▾」（開いていれば ▴）。 */
  readonly toggleLabel: string
  /** 一覧が開いているか。`landing` は開いた一覧をどこへ連れていくか。 */
  readonly list:
    | { readonly kind: "closed" }
    | { readonly kind: "open"; readonly landing: StepsLanding }
  readonly onToggle: () => void
  readonly groups: readonly CurrentWorkStepGroup[]
}

/**
 * 帯に出す形。`headLabel` は丸の右の字、`sideLabel` は右端の等幅の字。
 *
 * - `none`: 帯ごと出さない（本文が1つも無いまま閉じた依頼と、ワークプランも働きも無いとき）
 * - `working`: 中身が働くあいだ。送った直後から出す。今の段の名前・今の位置（`positionLabel`「後 1/3」。番号を持たない段では空）・「経過 6分12秒」・2行目（ワークプランが届く前は段の丸が無く字は空。チップが「作業中」を言うので重ねない）
 * - `finished`: 中身がレポートに入れ替わったあと。済んだ姿の字・「所要 21分49秒」の1行（ワークプランが無ければ字は空）
 *
 * `result` は状態のチップの状態。`working` は作業中・答え待ち・背景で作業中（ターンが終わってバックグラウンドタスクだけ残る）、`finished` は完了・答え待ち・止めた・失敗。
 */
export type WorkStripModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "working"
      readonly result: WorkStripResult
      readonly phases: readonly WorkStripSlot[]
      /** 丸の並び（`ol`）に付ける。吹き出しを閉じる「外を押した」の基準。 */
      readonly trackRef: RefObject<HTMLOListElement | null>
      /** 列を畳んでいるあいだの「いま: <節>」。出さないときは空。 */
      readonly readingLabel: string
      readonly headLabel: string
      readonly positionLabel: string
      readonly sideLabel: string
      readonly activity: WorkActivity
      readonly steps: WorkStripSteps
    }
  | {
      readonly kind: "finished"
      readonly result: WorkStripResult
      readonly phases: readonly WorkStripSlot[]
      readonly trackRef: RefObject<HTMLOListElement | null>
      readonly readingLabel: string
      readonly headLabel: string
      readonly sideLabel: string
      readonly steps: WorkStripSteps
    }

const NO_PLAN = { kind: "none" } as const satisfies LatestWorkPlan

const NAMED = { kind: "named" } as const satisfies PhaseNumber

const PHASE_STATE_SUFFIX = {
  done: "（済）",
  current: "（今の段）",
  asking: "（答え待ち）",
  upcoming: "",
} satisfies Record<WorkStripPhaseState, string>

const SKIPPED_PHASE_SUFFIX = "（飛ばした）"

const ASKING_MARK = "?"

const SKIPPED_STATE_WORD = "飛ばした · 所要"

/** 吹き出しの状態の行の頭。まだの段のほかは、あとに所要か経過を続ける。 */
const POPOVER_STATE_WORD = {
  done: "済み · 所要",
  current: "いま · この段",
  asking: "答え待ち · この段",
  upcoming: "これから",
} satisfies Record<WorkStripPhaseState, string>

const NO_RECAPS = new Map<string, PhaseRecap>()

const UNKNOWN_RECAP = {
  duration: { kind: "unknown" },
  summary: "",
} as const satisfies PhaseRecap

export function useWorkStrip(): WorkStripModel {
  const turnStepList = useCurrentTurnSteps()
  const content = useMainViewContent((state) => state.content)
  const records = useSession((session) => session.state.records)
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const reportDrafting = useSession((session) => reportDraftingOf(session.state.sdkTurn))
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const opened = useWorkStripSteps((state) => state.opened)
  const toggle = useWorkStripSteps((state) => state.toggle)
  const openAtPhase = useWorkStripSteps((state) => state.openAtPhase)
  const turns = useMainViewTurns()
  const moment = useSession((session) => conversationMoment(session.state))
  const plan = turnStepList.kind === "turn" ? turnStepList.plan : NO_PLAN
  const working = content.kind === "work"
  const newestResult = turnResultsOf(turns, moment).at(-1)
  const result = stripResultOf(newestResult, working, plan, {
    leftToBackground: turn.kind !== "running" && pending.length === 0 && backgroundTasks.length > 0,
  })
  const shown = content.kind !== "welcome" && result !== undefined
  const now = useNowWhile(shown && isTurnCounting(turn, backgroundTasks.length))
  const planned = plan.kind === "planned" ? plannedPhasesOf(plan) : []
  const readingLabel = useReadingSection((state) =>
    state.outlineCollapsed ? readingLabelOf(state.section) : "",
  )
  const popover = usePhasePopover(
    shown && turnStepList.kind === "turn"
      ? { kind: "shown", exchange: content.exchange, keys: planned.map(phaseKeyOf) }
      : { kind: "hidden" },
  )

  if (content.kind === "welcome" || turnStepList.kind !== "turn" || result === undefined) {
    return { kind: "none" }
  }

  const nowPhase = currentPhaseOf(plan)
  const completion = plan.kind === "planned" ? completionText(plan) : ""
  const { exchange } = content
  const firstPending = pending[0]
  const list: WorkStripSteps["list"] =
    opened.kind === "open" && opened.exchange === exchange
      ? { kind: "open", landing: opened.landing }
      : { kind: "closed" }
  const elapsedWord =
    result === "failed" ? FINISHED_LABEL : turnElapsedLabel(turn, backgroundTasks.length)
  const elapsedLabel = `${elapsedWord} ${turnElapsedText(turn, backgroundTasks.length, now)}`
  const steps: WorkStripSteps = {
    toggleLabel: `手順 ${String(turnStepList.steps.length)} ${list.kind === "open" ? "▴" : "▾"}`,
    list,
    onToggle: () => toggle(exchange),
    groups: currentWorkStepGroups(turnStepList.steps),
  }
  const stripPhases = slotsOf(
    plan,
    planned,
    {
      asking: working && firstPending !== undefined,
      spinning: working && (result === "working" || result === "background"),
    },
    {
      popover,
      recaps:
        popover.openKey === undefined
          ? NO_RECAPS
          : phaseRecapsOf(turnStepList.plans, {
              kind: "stamped",
              at: turnCountedUntil(turn, backgroundTasks.length, now),
            }),
      onGo: (phase) => {
        openAtPhase(exchange, phase.index)
        popover.close()
      },
    },
  )
  const { trackRef } = popover

  if (!working) {
    return {
      kind: "finished",
      result,
      phases: stripPhases,
      trackRef,
      readingLabel,
      headLabel: result === "working" && nowPhase.kind === "phase" ? nowPhase.name : completion,
      sideLabel: elapsedLabel,
      steps,
    }
  }

  return {
    kind: "working",
    phases: stripPhases,
    trackRef,
    result,
    readingLabel,
    headLabel: planned.length === 0 ? "" : nowPhase.kind === "phase" ? nowPhase.name : completion,
    positionLabel: nowPhase.kind === "phase" ? workPositionText(plan) : "",
    sideLabel: elapsedLabel,
    activity: workActivityOf({
      turnStepList,
      firstPending,
      reportDrafting,
      backgroundTasks,
      turn,
      apiTrouble,
      records,
      now,
    }),
    steps,
  }
}

/**
 * 最新のやり取りの結果から、チップの状態。出さないなら undefined。
 * 閉じたのに本文が無いやり取りは、ワークプランがあれば段の進みから（途中なら止めた、全部済みなら完了）、無ければ出さない。
 */
function stripResultOf(
  newest: TurnResult | undefined,
  working: boolean,
  plan: LatestWorkPlan,
  { leftToBackground }: { readonly leftToBackground: boolean },
): WorkStripResult | undefined {
  if (working) {
    if (newest === "awaiting-answer") {
      return newest
    }
    return leftToBackground ? "background" : "working"
  }
  if (newest !== undefined && newest !== "no-report") {
    return newest
  }
  if (plan.kind !== "planned") {
    return undefined
  }
  return finishedPhaseCount(plan) < phaseCount(plan.phases) ? "stopped" : "done"
}

function slotsOf(
  plan: LatestWorkPlan,
  planned: readonly PlannedPhase[],
  flags: PhaseFlags,
  context: PopoverContext,
): readonly WorkStripSlot[] {
  const entries = Object.values(groupBy(planned, (phase) => phase.entry))
  const spanOf = (members: readonly PlannedPhase[]): PhaseSpan | undefined => {
    const number =
      plan.kind === "planned" && members[0] !== undefined
        ? plannedPhaseNumber(plan, members[0])
        : NAMED
    return number.kind === "numbered" && number.span !== "whole" ? number.span : undefined
  }
  const currentSpan = spanOf(planned.filter((phase) => phase.state === "current"))
  return entries.map((members, position): WorkStripSlot => {
    const phases = members.map((phase) => toPhase(plan, phase, flags, context))
    const span = spanOf(members)
    const previous = entries[position - 1]
    const spanHead: WorkStripSpanHead =
      span !== undefined && (previous === undefined || spanOf(previous) !== span)
        ? { kind: "head", name: PHASE_SPAN_NAMES[span], current: span === currentSpan }
        : NO_SPAN_HEAD
    const [first] = phases
    if (phases.length === 1 && first !== undefined) {
      return { kind: "phase", spanHead, phase: first }
    }
    const number =
      plan.kind === "planned"
        ? phaseNumberOf(
            plan.delegatedRange,
            members.map((phase) => phase.index),
            phaseCount(plan.phases),
          )
        : NAMED
    const ordinal = phaseOrdinalText(number)
    return {
      kind: "parallel",
      spanHead,
      key: `group-${String(members[0]?.entry ?? 0)}`,
      label: ordinal === "" ? "並列" : `並列 ${ordinal}`,
      state: phases.every((phase) => phase.state === "done") ? "done" : "upcoming",
      phases,
    }
  })
}

const NO_SPAN_HEAD = { kind: "none" } as const satisfies WorkStripSpanHead

function toPhase(
  plan: LatestWorkPlan,
  phase: PlannedPhase,
  flags: PhaseFlags,
  context: PopoverContext,
): WorkStripPhase {
  const state: WorkStripPhaseState =
    phase.state === "current" && flags.asking ? "asking" : phase.state
  const key = phaseKeyOf(phase)
  return {
    key,
    mark: state === "asking" ? ASKING_MARK : phaseMarkOf(plan, phase),
    label: `${plan.kind === "planned" ? plannedPhaseTitle(plan, phase) : phase.name}${phase.skipped ? SKIPPED_PHASE_SUFFIX : PHASE_STATE_SUFFIX[state]}`,
    state,
    skipped: phase.skipped,
    spinning: flags.spinning && state === "current",
    popoverId: `work-strip-pop-${key}`,
    popover:
      context.popover.openKey === key ? popoverOf(plan, phase, state, context) : { kind: "closed" },
    onToggle: () => context.popover.toggle(key),
  }
}

function popoverOf(
  plan: LatestWorkPlan,
  phase: PlannedPhase,
  state: WorkStripPhaseState,
  context: PopoverContext,
): WorkStripPhasePopover {
  const recap = context.recaps.get(phase.key) ?? UNKNOWN_RECAP
  const word = phase.skipped ? SKIPPED_STATE_WORD : POPOVER_STATE_WORD[state]
  return {
    kind: "open",
    title:
      state === "done"
        ? `${phaseMarkOf(plan, phase)} ${phase.name}`
        : plan.kind === "planned"
          ? plannedPhaseTitle(plan, phase)
          : phase.name,
    meta: state === "upcoming" ? word : `${word} ${formatMeasured(recap.duration)}`,
    summary: state === "done" ? recap.summary : "",
    toSteps:
      state === "done" && !phase.skipped
        ? { kind: "shown", onGo: () => context.onGo(phase) }
        : { kind: "none" },
    placeRef: context.popover.placeRef,
  }
}

function phaseKeyOf(phase: PlannedPhase): string {
  return String(phase.index)
}
