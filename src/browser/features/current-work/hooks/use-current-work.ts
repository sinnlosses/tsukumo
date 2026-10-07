// 札「いまの作業」のロジック。
// tsukumo がいま何をしているかの語と、押すと開く依頼の手順の一覧を、見た目が受け取れる形まで畳んで返す。
//
// 範囲は依頼1つ（`useCurrentTurnSteps` が、最後の依頼より後のツールの記録から導く）。
// 要約は `summarizeToolInput` / `toolInputText` を使い、どの欄を読むかを2箇所で別に決めない。
//
// 開閉の状態はこの hook が1つだけ持つので、札が2箇所に描かれても押した先の DOM によらず同じ一覧が開く。
// 開閉は `usePopover` に任せ、閉じるたびに「すべて見る」を畳む。

import { useState, type RefCallback, type RefObject } from "react"

import type { DiaryWriting } from "../../../../shared/diary/diary.ts"
import type { BackgroundTask } from "../../../../shared/session-driver/background-task.ts"
import type { PendingAsk } from "../../../../shared/session-driver/pending-ask.ts"
import type { ReportDrafting } from "../../../../shared/session/session-state.ts"
import type { TurnStep, TurnStepList } from "../../../../shared/session/turn-step.ts"
import {
  currentPhaseOf,
  phaseCount,
  phaseLabel,
  plannedPhasesOf,
} from "../../../../shared/session/work-plan.ts"
import { DEFAULT_CHARACTER_NAME } from "../../../domain/portrait-appearance.ts"
import { toolInputText } from "../../../domain/tool-summary.ts"
import { usePopover } from "../../../hooks/use-popover.ts"
import { useCurrentTurnSteps } from "../../../stores/current-turn-steps.ts"
import { useInquiryJump } from "../../../stores/inquiry-jump.ts"
import { navigateTo, useScreen } from "../../../stores/screen.tsx"
import { useSession, useTurnRunning } from "../../../stores/session.ts"
import { useTurnSelection } from "../../../stores/turn-selection.ts"
import { monthDayLabel } from "../../../utils/month-day-label.ts"
import {
  BACKGROUND_TASK_KIND_LABEL,
  backgroundSummaryLabel,
  currentWorkStepGroups,
  currentWorkStepLabel,
  truncateForDisplay,
  type CurrentWorkStepGroup,
} from "../domain/current-work-step.ts"

/** 閉じている間に出す手順の件数（これより多いと「すべて見る」の口が出る）。 */
const MAX_COLLAPSED_STEPS = 5

/**
 * 状態の語（上ほど強い）。
 * `background` はターンは終わっているが背景のタスクが動いているとき。
 * `diary` は成果の振り返りで日記を書いているとき（`state.diaryWriting.kind === "writing"`）。
 * 会話のターンと並んで書いているので作業中より弱い（作業中が動いていれば作業中を出す）。
 */
export type CurrentWorkState = "stopped" | "pending" | "running" | "diary" | "background" | "idle"

const WORK_WORD_LABEL = {
  stopped: "止まっている",
  pending: "答え待ち",
  running: "作業中",
  diary: "振り返り中",
  background: "背景で作業中",
  idle: "依頼待ち",
} satisfies Record<CurrentWorkState, string>

/**
 * 札に出す今の段（`.current-work-phase`）。作業中・答え待ちで、その依頼に段取りがあるときだけ `shown`。
 * 字は「2/4 段の名前」、全部の段を終えていれば「4/4 済」。
 */
export type CurrentWorkPhase =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly label: string }

/** 一覧の頭の段の並び1つ。印は済んだ段が「済」、今の段が「今」、残りは番号。 */
export type CurrentWorkPlanPhase = {
  readonly key: string
  readonly mark: string
  readonly name: string
  readonly state: "done" | "current" | "upcoming"
}

/** 一覧の頭の段取り。その依頼に段取りがあれば、状態の語に関わらず出す。 */
export type CurrentWorkPlan =
  | { readonly kind: "none" }
  | {
      readonly kind: "planned"
      /** 「この依頼の段取り」（ターンが走っていなければ「前の依頼の段取り」）。 */
      readonly headingLabel: string
      readonly phases: readonly CurrentWorkPlanPhase[]
    }

/**
 * 実行中の手順があるかどうかと、札の要約にも出すか（`pending` / `running` のときだけ）。
 *
 * - `none`: 実行中の手順が無い
 * - `silent`: 実行中の手順はあるが、いまの状態の語では札に要約を出さない（`idle` / `background` / `stopped`。一覧を開けば出る）
 * - `shown`: 実行中の手順があり、札にも要約を出す（`pending` / `running`）
 */
export type CurrentWorkRunningStep =
  | { readonly kind: "none" }
  | { readonly kind: "silent"; readonly toolName: string; readonly fullText: string }
  | {
      readonly kind: "shown"
      readonly toolName: string
      readonly fullText: string
      readonly summaryLabel: string
    }

/**
 * 札に出す要約（`.current-work-summary`）。
 * 答え待ちで先頭の答え待ちが質問なら、実行中の手順の要約より質問の要約を優先する。
 * 許可要求の答え待ちは実行中の手順の要約に従う。
 */
export type CurrentWorkSummary =
  | { readonly kind: "none" }
  | { readonly kind: "text"; readonly label: string }

export type CurrentWorkBackgroundTask = {
  readonly key: string
  /** 種類の語（「シェル」「サブエージェント」「その他」）。 */
  readonly kindLabel: string
  /** claude が添えた説明。無ければ空（行には種類の語だけが出る）。 */
  readonly description: string
}

/** 一覧の「背景で動いているもの」の区画。状態の語に関わらず、動いているものがあれば出す。 */
export type CurrentWorkBackgroundList =
  | { readonly kind: "none" }
  | {
      readonly kind: "tasks"
      readonly headingLabel: string
      readonly tasks: readonly CurrentWorkBackgroundTask[]
    }

/** 「手順をすべて見る」の口。{@link MAX_COLLAPSED_STEPS} 件以下なら出さない（`fixed`）。 */
export type CurrentWorkToggleAll =
  | { readonly kind: "fixed" }
  | { readonly kind: "expandable"; readonly label: string }

/**
 * 依頼の手順の一覧が取りうる3つの状態:
 *
 * - `no-request`: 依頼が一度も無い（「まだ依頼が無い」）
 * - `empty`: 依頼はあるが、この依頼ではまだツールを使っていない
 * - `steps`: 手順が1件以上ある
 */
export type CurrentWorkStepList =
  | { readonly kind: "no-request" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "steps"
      /** 「この依頼での手順」（ターンが走っていなければ「前の依頼での手順」）。 */
      readonly headingLabel: string
      /** 閉じている間は新しい5件、開いていれば全件（{@link expanded}）を、段で区切ったもの。 */
      readonly groups: readonly CurrentWorkStepGroup[]
      readonly expanded: boolean
      readonly onToggleExpanded: () => void
      readonly toggleAll: CurrentWorkToggleAll
    }

/**
 * 一覧の見出しの下に出す、答えの場所への口。
 * 答え待ち（許可要求・質問）のときだけ「お伺いへ」を出し、押すとメインビューのお伺いの札へ連れていく。
 */
export type CurrentWorkPendingHint =
  | { readonly kind: "none" }
  | { readonly kind: "inquiry"; readonly onGoToInquiry: () => void }

export type CurrentWork = {
  readonly state: CurrentWorkState
  readonly wordLabel: string
  /** 印（○ / ●）。依頼待ちは中抜きだが、雑談中の依頼待ちだけ埋める（{@link chatIdle}）。 */
  readonly mark: "○" | "●"
  /**
   * 雑談中の依頼待ちか。
   * true のときだけ `wordLabel` が「<名前> とおしゃべり中」になり、印と字の色が `--accent` に変わる（CSS の `[data-chat-idle="true"]`）。
   */
  readonly chatIdle: boolean
  readonly pendingHint: CurrentWorkPendingHint
  /** 札の今の段（{@link CurrentWorkPhase}）。要約とは別の欄で、要約の判定には関わらない。 */
  readonly phase: CurrentWorkPhase
  /** 札の要約（{@link CurrentWorkSummary}）。答え待ちの質問はこれで実行中の手順を覆う。 */
  readonly summary: CurrentWorkSummary
  readonly runningStep: CurrentWorkRunningStep
  readonly backgroundList: CurrentWorkBackgroundList
  readonly plan: CurrentWorkPlan
  readonly stepList: CurrentWorkStepList
  readonly open: boolean
  readonly onToggle: () => void
  /**
   * 札の `<button>` を預ける口（Esc で閉じたときのフォーカスの戻り先）。
   * `RefObject` ではなくコールバック ref なのは、同じ札が2箇所に描かれるため。
   * 入れ物を1つにすると後から付いたほうで上書きされ、面を閉じた時点で戻り先が空になる。
   * 付いている札を全部集めておき、Esc のときはその全部へ `.focus()` を呼ぶ（見えていないほうは `display: none` で効かない）。
   */
  readonly toggleRef: RefCallback<HTMLButtonElement>
}

/** `boundaryRef` の箱の外を押すと一覧を閉じる。 */
export function useCurrentWork(boundaryRef: RefObject<HTMLElement | null>): CurrentWork {
  const endedReason = useSession((session) => session.state.endedReason)
  const pending = useSession((session) => session.state.pending)
  const turnInProgress = useTurnRunning()
  const turnStepList = useCurrentTurnSteps()
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const diaryWriting = useSession((session) => session.state.diaryWriting)
  const reportDrafting = useSession((session) => session.state.reportDrafting)
  const chatMode = useSession((session) => session.state.chatMode)
  const characterName = useSession((session) => session.state.character?.name)
  const screen = useScreen()
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  const requestInquiryJump = useInquiryJump((state) => state.requestJump)

  const [expanded, setExpanded] = useState(false)
  const { open, onToggle, close, toggleRef } = usePopover({
    rootRef: boundaryRef,
    onReset: () => setExpanded(false),
  })

  function onToggleExpanded(): void {
    setExpanded((wasExpanded) => !wasExpanded)
  }

  // お伺いへ。一覧を閉じ、ほかの画面を見ていれば会話の画面へ戻し、過去のやり取りを見ていれば最新へ戻してから、メインビューのお伺いの札までスクロールさせる。
  function onGoToInquiry(): void {
    close()
    if (screen !== "conversation") {
      navigateTo("conversation")
    }
    if (newestTurnId !== undefined && activeTurnId !== newestTurnId) {
      selectTurn(newestTurnId)
    }
    requestInquiryJump({ focus: false })
  }

  const sessionEnded = endedReason !== undefined
  const firstPending = pending[0]

  const state: CurrentWorkState = sessionEnded
    ? "stopped"
    : firstPending !== undefined
      ? "pending"
      : turnInProgress
        ? "running"
        : diaryWriting.kind === "writing"
          ? "diary"
          : backgroundTasks.length > 0
            ? "background"
            : "idle"

  // 雑談中の依頼待ちだけ「<名前> とおしゃべり中」に変える。
  // 答え待ち・作業中・止まっているは、雑談中でもそのまま意味を持つ語なので変えない。
  const chatIdle = state === "idle" && chatMode

  const runningStep = toRunningStepView(turnStepList, state)

  return {
    state,
    wordLabel: chatIdle
      ? `${characterName ?? DEFAULT_CHARACTER_NAME} とおしゃべり中`
      : WORK_WORD_LABEL[state],
    mark: state === "idle" && !chatIdle ? "○" : "●",
    chatIdle,
    pendingHint: toPendingHintView(state, firstPending, onGoToInquiry),
    phase: toPhaseView(turnStepList, state),
    summary: toSummaryView(
      state,
      firstPending,
      runningStep,
      backgroundTasks,
      diaryWriting,
      reportDrafting,
    ),
    runningStep,
    backgroundList: toBackgroundListView(backgroundTasks),
    plan: toPlanView(turnStepList, turnInProgress),
    stepList: toStepListView(turnStepList, { turnInProgress, expanded, onToggleExpanded }),
    open,
    onToggle,
    toggleRef,
  }
}

/** {@link CurrentWorkRunningStep} を組み立てる。「札に要約も出すか」はここで決める。 */
function toRunningStepView(
  turnStepList: TurnStepList,
  state: CurrentWorkState,
): CurrentWorkRunningStep {
  const latestRunning =
    turnStepList.kind === "turn" ? turnStepList.steps.findLast(isRunningStep) : undefined
  if (latestRunning === undefined) {
    return { kind: "none" }
  }

  const toolName = latestRunning.name
  const fullText = truncateForDisplay(toolInputText(latestRunning.name, latestRunning.input))

  return state === "pending" || state === "running"
    ? { kind: "shown", toolName, fullText, summaryLabel: currentWorkStepLabel(latestRunning) }
    : { kind: "silent", toolName, fullText }
}

function isRunningStep(step: TurnStep): boolean {
  return step.status.kind === "running"
}

function toPhaseView(turnStepList: TurnStepList, state: CurrentWorkState): CurrentWorkPhase {
  if (turnStepList.kind !== "turn" || (state !== "running" && state !== "pending")) {
    return { kind: "none" }
  }
  const { plan } = turnStepList
  if (plan.kind === "none") {
    return { kind: "none" }
  }
  const phase = currentPhaseOf(plan)
  return {
    kind: "shown",
    label:
      phase.kind === "phase"
        ? phaseLabel(phase)
        : `${String(phaseCount(plan.phases))}/${String(phaseCount(plan.phases))} 済`,
  }
}

function toPlanView(turnStepList: TurnStepList, turnInProgress: boolean): CurrentWorkPlan {
  if (turnStepList.kind !== "turn" || turnStepList.plan.kind === "none") {
    return { kind: "none" }
  }
  return {
    kind: "planned",
    headingLabel: turnInProgress ? "この依頼の段取り" : "前の依頼の段取り",
    phases: plannedPhasesOf(turnStepList.plan).map(({ index, name, state }) => ({
      key: String(index),
      mark: state === "done" ? "済" : state === "current" ? "今" : String(index + 1),
      name,
      state,
    })),
  }
}

/**
 * {@link CurrentWorkSummary} を組み立てる。
 * 答え待ちの先頭が質問なら、実行中の手順の要約より質問の要約を優先する。
 * 背景で作業中なら背景のタスクの要約、振り返り中は「<日付>の日記を書いています」を出す。
 * メインが `report` の引数を書いている途中（{@link ReportDrafting}）は、実行中の手順の要約より優先する。
 */
function toSummaryView(
  state: CurrentWorkState,
  firstPending: PendingAsk | undefined,
  runningStep: CurrentWorkRunningStep,
  backgroundTasks: readonly BackgroundTask[],
  diaryWriting: DiaryWriting,
  reportDrafting: ReportDrafting,
): CurrentWorkSummary {
  if (state === "diary" && diaryWriting.kind === "writing") {
    return {
      kind: "text",
      label: `${monthDayLabel(Temporal.PlainDate.from(diaryWriting.date))}の日記を書いています`,
    }
  }
  if (state === "background") {
    const label = backgroundSummaryLabel(backgroundTasks)
    return label === undefined ? { kind: "none" } : { kind: "text", label }
  }
  if (state === "pending" && firstPending?.kind === "question") {
    const label = questionSummaryLabel(firstPending)
    if (label !== undefined) {
      return { kind: "text", label }
    }
  }
  if (reportDrafting.kind === "drafting") {
    return { kind: "text", label: "レポートを書いています" }
  }
  return runningStep.kind === "shown"
    ? { kind: "text", label: runningStep.summaryLabel }
    : { kind: "none" }
}

/**
 * 質問の要約。1問目の `header` をそのまま使う。
 * `AskUserQuestion` の入力の型（`node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts`）で「最大12字」と決まっているので、切り詰める必要が無い。
 * 2問以上あれば「ほか n問」を添える。
 */
function questionSummaryLabel(
  pending: Extract<PendingAsk, { readonly kind: "question" }>,
): string | undefined {
  const [first, ...rest] = pending.questions
  if (first === undefined) {
    return undefined
  }
  return rest.length > 0 ? `${first.header} ほか${String(rest.length)}問` : first.header
}

function toBackgroundListView(tasks: readonly BackgroundTask[]): CurrentWorkBackgroundList {
  if (tasks.length === 0) {
    return { kind: "none" }
  }
  return {
    kind: "tasks",
    headingLabel: `背景で動いているもの（${String(tasks.length)} 件）`,
    tasks: tasks.map((task) => ({
      key: task.taskId,
      kindLabel: BACKGROUND_TASK_KIND_LABEL[task.kind],
      description: task.description,
    })),
  }
}

function toPendingHintView(
  state: CurrentWorkState,
  firstPending: PendingAsk | undefined,
  onGoToInquiry: () => void,
): CurrentWorkPendingHint {
  return state !== "pending" || firstPending === undefined
    ? { kind: "none" }
    : { kind: "inquiry", onGoToInquiry }
}

function toStepListView(
  turnStepList: TurnStepList,
  options: {
    readonly turnInProgress: boolean
    readonly expanded: boolean
    readonly onToggleExpanded: () => void
  },
): CurrentWorkStepList {
  if (turnStepList.kind === "no-request") {
    return { kind: "no-request" }
  }
  if (turnStepList.steps.length === 0) {
    return { kind: "empty" }
  }

  const { steps } = turnStepList
  const { expanded, onToggleExpanded, turnInProgress } = options
  const visibleSteps = expanded ? steps : steps.slice(-MAX_COLLAPSED_STEPS)

  return {
    kind: "steps",
    headingLabel: turnInProgress ? "この依頼での手順" : "前の依頼での手順",
    groups: currentWorkStepGroups(visibleSteps),
    expanded,
    onToggleExpanded,
    toggleAll: toToggleAllView(steps, expanded),
  }
}

function toToggleAllView(steps: readonly TurnStep[], expanded: boolean): CurrentWorkToggleAll {
  if (steps.length <= MAX_COLLAPSED_STEPS) {
    return { kind: "fixed" }
  }
  if (expanded) {
    return { kind: "expandable", label: "新しい5件だけにする" }
  }

  const hiddenSteps = steps.slice(0, steps.length - MAX_COLLAPSED_STEPS)
  const hiddenFailureCount = hiddenSteps.filter((step) => step.status.kind === "failed").length
  const label =
    hiddenFailureCount > 0
      ? `手順をすべて見る（全 ${String(steps.length)} 件・失敗 ${String(hiddenFailureCount)}）`
      : `手順をすべて見る（全 ${String(steps.length)} 件）`
  return { kind: "expandable", label }
}
