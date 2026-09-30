// 帯のまん中の札「いまの作業」のロジック。
// tsukumo がいま何をしているかの語と、押すと開く依頼の手順の一覧を、見た目が受け取れる形まで畳んで返す。
//
// 範囲は依頼1つ（`currentTurnSteps` が、最後の依頼より後のツールの記録から導く）。
// 要約は `summarizeToolInput` / `toolInputText` を使い、どの欄を読むかを2箇所で別に決めない。
//
// 札は2箇所に描かれる（広い画面の帯・狭い画面の「≡」の面の中。どちらを出すかは CSS が決める）。
// 開閉の状態はこの hook が1つだけ持ち、押した先の DOM がどちらでも同じ一覧が開く。
// 「≡」とは同時に開かない。
// 広い画面には「≡」が無く、狭い画面ではこの札そのものが「≡」の面の中にしか無いので、状態の突き合わせは要らない。
//
// 開閉は `useNavPopover` に任せ、閉じるたびに「すべて見る」を畳む。

import { useState, type RefCallback, type RefObject } from "react"

import type { DiaryWriting } from "../../../../../shared/diary/diary.ts"
import type {
  BackgroundTask,
  BackgroundTaskKind,
} from "../../../../../shared/session-driver/background-task.ts"
import type { PendingAsk } from "../../../../../shared/session-driver/pending-ask.ts"
import type { ReportDrafting } from "../../../../../shared/session/session-state.ts"
import {
  currentTurnSteps,
  toolDuration,
  type TurnStep,
  type TurnStepList,
  type TurnStepStatus,
} from "../../../../../shared/session/turn-step.ts"
import {
  currentPhaseOf,
  phaseLabel,
  type WorkPhase,
} from "../../../../../shared/session/work-plan.ts"
import { formatElapsed } from "../../../../../shared/utils/elapsed-time.ts"
import { DEFAULT_CHARACTER_NAME } from "../../../../domain/portrait-appearance.ts"
import { summarizeToolInput, toolInputText } from "../../../../domain/tool-summary.ts"
import { useQuestionScroll } from "../../../../stores/question-scroll.ts"
import { navigateTo, useScreen } from "../../../../stores/screen.tsx"
import { useSession, useTurnRunning } from "../../../../stores/session.ts"
import { useTurnSelection } from "../../../../stores/turn-selection.ts"
import { monthDayLabel } from "../../../../utils/month-day-label.ts"
import { useNavPopover } from "./use-nav-popover.ts"

/** 閉じている間に出す手順の件数（これより多いと「すべて見る」の口が出る）。 */
const MAX_COLLAPSED_STEPS = 5

/**
 * 状態の語（上ほど強い）。
 * `background` はターンは終わっているが背景のタスクが動いているとき。
 * `diary` は成果の振り返りで日記を書いているとき（`state.diaryWriting.kind === "writing"`）。
 * 会話のターンと並んで書いているので作業中より弱い（作業中が動いていれば作業中を出す）。
 */
export type ScreenNavCurrentWorkState =
  | "stopped"
  | "pending"
  | "running"
  | "diary"
  | "background"
  | "idle"

const WORK_WORD_LABEL = {
  stopped: "止まっている",
  pending: "答え待ち",
  running: "作業中",
  diary: "振り返り中",
  background: "背景で作業中",
  idle: "依頼待ち",
} satisfies Record<ScreenNavCurrentWorkState, string>

const BACKGROUND_TASK_KIND_LABEL = {
  shell: "シェル",
  agent: "サブエージェント",
  other: "その他",
} satisfies Record<BackgroundTaskKind, string>

export type ScreenNavCurrentWorkStep = {
  readonly key: string
  readonly label: string
  readonly nested: boolean
  readonly status: TurnStepStatus
  readonly input: unknown
}

/**
 * 手順を始まったときの段で区切った1まとまり。
 * 小見出しは「2/4 段の名前」で、段取りより前・全部の段を終えたあとの手順は小見出しを持たない。
 */
export type ScreenNavCurrentWorkStepGroup = {
  readonly key: string
  readonly heading: { readonly kind: "none" } | { readonly kind: "phase"; readonly label: string }
  readonly steps: readonly ScreenNavCurrentWorkStep[]
}

/**
 * 札に出す今の段（`.screen-nav-work-phase`）。作業中・答え待ちで、その依頼に段取りがあるときだけ `shown`。
 * 字は「2/4 段の名前」、全部の段を終えていれば「4/4 済」。
 */
export type ScreenNavCurrentWorkPhase =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly label: string }

/** 一覧の頭の段の並び1つ。印は済んだ段が「済」、今の段が「今」、残りは番号。 */
export type ScreenNavCurrentWorkPlanPhase = {
  readonly key: string
  readonly mark: string
  readonly name: string
  readonly state: "done" | "current" | "upcoming"
}

/** 一覧の頭の段取り。その依頼に段取りがあれば、状態の語に関わらず出す。 */
export type ScreenNavCurrentWorkPlan =
  | { readonly kind: "none" }
  | {
      readonly kind: "planned"
      /** 「この依頼の段取り」（ターンが走っていなければ「前の依頼の段取り」）。 */
      readonly headingLabel: string
      readonly phases: readonly ScreenNavCurrentWorkPlanPhase[]
    }

/**
 * 実行中の手順があるかどうかと、札の要約にも出すか（`pending` / `running` のときだけ）。
 *
 * - `none`: 実行中の手順が無い
 * - `silent`: 実行中の手順はあるが、いまの状態の語では札に要約を出さない（`idle` / `background` / `stopped`。一覧を開けば出る）
 * - `shown`: 実行中の手順があり、札にも要約を出す（`pending` / `running`）
 */
export type ScreenNavCurrentWorkRunningStep =
  | { readonly kind: "none" }
  | { readonly kind: "silent"; readonly toolName: string; readonly fullText: string }
  | {
      readonly kind: "shown"
      readonly toolName: string
      readonly fullText: string
      readonly summaryLabel: string
    }

/**
 * 札に出す要約（`.screen-nav-work-summary`）。
 * 答え待ちで先頭の答え待ちが質問なら、実行中の手順の要約より質問の要約を優先する。
 * 許可要求の答え待ちは実行中の手順の要約に従う。
 */
export type ScreenNavCurrentWorkSummary =
  | { readonly kind: "none" }
  | { readonly kind: "text"; readonly label: string }

export type ScreenNavCurrentWorkBackgroundTask = {
  readonly key: string
  /** 種類の語（「シェル」「サブエージェント」「その他」）。 */
  readonly kindLabel: string
  /** claude が添えた説明。無ければ空（行には種類の語だけが出る）。 */
  readonly description: string
}

/** 一覧の「背景で動いているもの」の区画。状態の語に関わらず、動いているものがあれば出す。 */
export type ScreenNavCurrentWorkBackgroundList =
  | { readonly kind: "none" }
  | {
      readonly kind: "tasks"
      readonly headingLabel: string
      readonly tasks: readonly ScreenNavCurrentWorkBackgroundTask[]
    }

/** 「手順をすべて見る」の口。{@link MAX_COLLAPSED_STEPS} 件以下なら出さない（`fixed`）。 */
export type ScreenNavCurrentWorkToggleAll =
  | { readonly kind: "fixed" }
  | { readonly kind: "expandable"; readonly label: string }

/**
 * 依頼の手順の一覧が取りうる3つの状態:
 *
 * - `no-request`: 依頼が一度も無い（「まだ依頼が無い」）
 * - `empty`: 依頼はあるが、この依頼ではまだツールを使っていない
 * - `steps`: 手順が1件以上ある
 */
export type ScreenNavCurrentWorkStepList =
  | { readonly kind: "no-request" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "steps"
      /** 「この依頼での手順」（ターンが走っていなければ「前の依頼での手順」）。 */
      readonly headingLabel: string
      /** 閉じている間は新しい5件、開いていれば全件（{@link expanded}）を、段で区切ったもの。 */
      readonly groups: readonly ScreenNavCurrentWorkStepGroup[]
      readonly expanded: boolean
      readonly onToggleExpanded: () => void
      readonly toggleAll: ScreenNavCurrentWorkToggleAll
    }

/**
 * 一覧の見出しに添える、答えの場所の案内。
 * 答え待ちのときだけ意味を持ち、答え待ちの中身で行き先が変わる。
 *
 * - `none`: 答え待ちでない
 * - `input`: 許可要求。「。入力欄の上で答えられる」を添える
 * - `question`: 質問（メインビューの札で答える）。見出しの文面は変えず、一覧に「質問へ」の口を出す
 */
export type ScreenNavCurrentWorkPendingHint =
  | { readonly kind: "none" }
  | { readonly kind: "input" }
  | { readonly kind: "question"; readonly onGoToQuestion: () => void }

export type ScreenNavCurrentWork = {
  readonly state: ScreenNavCurrentWorkState
  readonly wordLabel: string
  /** 印（○ / ●）。依頼待ちは中抜きだが、雑談中の依頼待ちだけ埋める（{@link chatIdle}）。 */
  readonly mark: "○" | "●"
  /**
   * 雑談中の依頼待ちか。
   * true のときだけ `wordLabel` が「<名前> とおしゃべり中」になり、印と字の色が `--accent` に変わる（CSS の `[data-chat-idle="true"]`）。
   */
  readonly chatIdle: boolean
  readonly pendingHint: ScreenNavCurrentWorkPendingHint
  /** 札の今の段（{@link ScreenNavCurrentWorkPhase}）。要約とは別の欄で、要約の判定には関わらない。 */
  readonly phase: ScreenNavCurrentWorkPhase
  /** 札の要約（{@link ScreenNavCurrentWorkSummary}）。答え待ちの質問はこれで実行中の手順を覆う。 */
  readonly summary: ScreenNavCurrentWorkSummary
  readonly runningStep: ScreenNavCurrentWorkRunningStep
  readonly backgroundList: ScreenNavCurrentWorkBackgroundList
  readonly plan: ScreenNavCurrentWorkPlan
  readonly stepList: ScreenNavCurrentWorkStepList
  readonly open: boolean
  readonly onToggle: () => void
  /**
   * 札の `<button>` を預ける口（Esc で閉じたときのフォーカスの戻り先）。
   * `RefObject` ではなくコールバック ref なのは、同じ札が広い画面の帯と「≡」の面の2箇所に描かれるため。
   * 入れ物を1つにすると後から付いたほうで上書きされ、面を閉じた時点で戻り先が空になる。
   * 付いている札を全部集めておき、Esc のときはその全部へ `.focus()` を呼ぶ（見えていないほうは `display: none` で効かない）。
   */
  readonly toggleRef: RefCallback<HTMLButtonElement>
}

/** `navRef` は帯全体（`<nav>`）。外側を押したかの判定に使う（「≡」と同じ `ref`）。 */
export function useCurrentWork(navRef: RefObject<HTMLElement | null>): ScreenNavCurrentWork {
  const endedReason = useSession((session) => session.state.endedReason)
  const pending = useSession((session) => session.state.pending)
  const turnInProgress = useTurnRunning()
  const records = useSession((session) => session.state.records)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const diaryWriting = useSession((session) => session.state.diaryWriting)
  const reportDrafting = useSession((session) => session.state.reportDrafting)
  const chatMode = useSession((session) => session.state.chatMode)
  const characterName = useSession((session) => session.state.character?.name)
  const screen = useScreen()
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  const requestScroll = useQuestionScroll((state) => state.requestScroll)

  const [expanded, setExpanded] = useState(false)
  const { open, onToggle, close, toggleRef } = useNavPopover({
    navRef,
    onReset: () => setExpanded(false),
  })

  function onToggleExpanded(): void {
    setExpanded((wasExpanded) => !wasExpanded)
  }

  // 質問へ。一覧を閉じ、ほかの画面を見ていれば会話の画面へ戻し、過去のやり取りを見ていれば最新へ戻してから、メインビューの質問の札までスクロールさせる。
  function onGoToQuestion(): void {
    close()
    if (screen !== "conversation") {
      navigateTo("conversation")
    }
    if (newestTurnId !== undefined && activeTurnId !== newestTurnId) {
      selectTurn(newestTurnId)
    }
    requestScroll()
  }

  const sessionEnded = endedReason !== undefined
  const turnStepList = currentTurnSteps(records, sessionEnded)
  const firstPending = pending[0]

  const state: ScreenNavCurrentWorkState = sessionEnded
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
    pendingHint: toPendingHintView(state, firstPending, onGoToQuestion),
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

/** {@link ScreenNavCurrentWorkRunningStep} を組み立てる。「札に要約も出すか」はここで決める。 */
function toRunningStepView(
  turnStepList: TurnStepList,
  state: ScreenNavCurrentWorkState,
): ScreenNavCurrentWorkRunningStep {
  const latestRunning =
    turnStepList.kind === "turn" ? turnStepList.steps.findLast(isRunningStep) : undefined
  if (latestRunning === undefined) {
    return { kind: "none" }
  }

  const toolName = latestRunning.name
  const fullText = toolInputText(latestRunning.name, latestRunning.input)

  return state === "pending" || state === "running"
    ? { kind: "shown", toolName, fullText, summaryLabel: stepLabel(latestRunning) }
    : { kind: "silent", toolName, fullText }
}

function isRunningStep(step: TurnStep): boolean {
  return step.status.kind === "running"
}

function toPhaseView(
  turnStepList: TurnStepList,
  state: ScreenNavCurrentWorkState,
): ScreenNavCurrentWorkPhase {
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
        : `${String(plan.phases.length)}/${String(plan.phases.length)} 済`,
  }
}

function toPlanView(turnStepList: TurnStepList, turnInProgress: boolean): ScreenNavCurrentWorkPlan {
  if (turnStepList.kind !== "turn" || turnStepList.plan.kind === "none") {
    return { kind: "none" }
  }
  const { phases, current } = turnStepList.plan
  return {
    kind: "planned",
    headingLabel: turnInProgress ? "この依頼の段取り" : "前の依頼の段取り",
    phases: phases.map((name, index) => {
      const state = index < current ? "done" : index === current ? "current" : "upcoming"
      return {
        key: String(index),
        mark: state === "done" ? "済" : state === "current" ? "今" : String(index + 1),
        name,
        state,
      }
    }),
  }
}

/**
 * {@link ScreenNavCurrentWorkSummary} を組み立てる。
 * 答え待ちの先頭が質問なら、実行中の手順の要約より質問の要約を優先する。
 * 背景で作業中なら背景のタスクの要約、振り返り中は「<日付>の日記を書いています」を出す。
 * メインが `report` の引数を書いている途中（{@link ReportDrafting}）は、実行中の手順の要約より優先する。
 */
function toSummaryView(
  state: ScreenNavCurrentWorkState,
  firstPending: PendingAsk | undefined,
  runningStep: ScreenNavCurrentWorkRunningStep,
  backgroundTasks: readonly BackgroundTask[],
  diaryWriting: DiaryWriting,
  reportDrafting: ReportDrafting,
): ScreenNavCurrentWorkSummary {
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

/**
 * 背景のタスクの要約。いちばん新しく始まったもの（並びの末尾）の説明を出し、2件以上あれば「ほか n件」を添える。
 * 説明が無ければ種類の語で代える。
 */
function backgroundSummaryLabel(tasks: readonly BackgroundTask[]): string | undefined {
  const newest = tasks.at(-1)
  if (newest === undefined) {
    return undefined
  }
  const label = backgroundTaskLabel(newest)
  return tasks.length > 1 ? `${label} ほか${String(tasks.length - 1)}件` : label
}

function backgroundTaskLabel(task: BackgroundTask): string {
  return task.description === "" ? BACKGROUND_TASK_KIND_LABEL[task.kind] : task.description
}

function toBackgroundListView(
  tasks: readonly BackgroundTask[],
): ScreenNavCurrentWorkBackgroundList {
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
  state: ScreenNavCurrentWorkState,
  firstPending: PendingAsk | undefined,
  onGoToQuestion: () => void,
): ScreenNavCurrentWorkPendingHint {
  if (state !== "pending" || firstPending === undefined) {
    return { kind: "none" }
  }
  return firstPending.kind === "question" ? { kind: "question", onGoToQuestion } : { kind: "input" }
}

function toStepListView(
  turnStepList: TurnStepList,
  options: {
    readonly turnInProgress: boolean
    readonly expanded: boolean
    readonly onToggleExpanded: () => void
  },
): ScreenNavCurrentWorkStepList {
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
    groups: groupByPhase(visibleSteps),
    expanded,
    onToggleExpanded,
    toggleAll: toToggleAllView(steps, expanded),
  }
}

/** 並びの隣どうしで段が同じ手順を1まとまりにする（段を戻る段取りの変更があっても、並びの順は崩さない）。 */
function groupByPhase(steps: readonly TurnStep[]): readonly ScreenNavCurrentWorkStepGroup[] {
  return steps.reduce<readonly ScreenNavCurrentWorkStepGroup[]>((groups, step) => {
    const heading = stepGroupHeading(step.phase)
    const last = groups.at(-1)
    return last !== undefined && sameHeading(last.heading, heading)
      ? [...groups.slice(0, -1), { ...last, steps: [...last.steps, toStepView(step)] }]
      : [...groups, { key: step.toolUseId, heading, steps: [toStepView(step)] }]
  }, [])
}

function stepGroupHeading(phase: WorkPhase): ScreenNavCurrentWorkStepGroup["heading"] {
  return phase.kind === "phase" ? { kind: "phase", label: phaseLabel(phase) } : { kind: "none" }
}

function sameHeading(
  a: ScreenNavCurrentWorkStepGroup["heading"],
  b: ScreenNavCurrentWorkStepGroup["heading"],
): boolean {
  return a.kind === "phase" && b.kind === "phase" ? a.label === b.label : a.kind === b.kind
}

function toToggleAllView(
  steps: readonly TurnStep[],
  expanded: boolean,
): ScreenNavCurrentWorkToggleAll {
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

/**
 * 手順1件の見出し。終わっていて所要時間が測れれば（{@link toolDuration}）末尾に添える。
 * 復元した手順は測れないので添えない。
 */
function stepLabel(step: TurnStep): string {
  const summary = summarizeToolInput(step.name, step.input)
  const base = summary === "" ? step.name : `${step.name}: ${summary}`
  const duration = toolDuration(step)
  return duration.kind === "known"
    ? `${base}（${formatElapsed(Math.round(duration.milliseconds / 1000))}）`
    : base
}

function toStepView(step: TurnStep): ScreenNavCurrentWorkStep {
  return {
    key: step.toolUseId,
    label: stepLabel(step),
    nested: step.nested,
    status: step.status,
    input: step.input,
  }
}
