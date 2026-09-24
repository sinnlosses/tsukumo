// 帯のまん中の札「いまの作業」のロジック（docs/screen-design.md 13.9「いまの作業」/ docs/glossary.md
// 「いまの作業」「依頼の手順」）。tsukumo がいま何をしているかの語と、押すと開く**依頼の手順**の
// 一覧を、見た目が受け取れる形まで畳んで返す。
//
// **範囲は依頼1つ**（`src/shared/turn-step.ts` の `currentTurnSteps` が、最後の依頼より後の
// ツールの記録から導く）。要約は `src/browser/lib/tool-summary.ts`（`summarizeToolInput` /
// `toolInputText`）を使い、どの欄を読むかを2箇所で別に決めない。
//
// **札は2箇所に描かれる**（広い画面の帯・狭い画面の「≡」の面の中。`ScreenNavRoom` などと同じ
// 畳み方で、どちらを出すかは CSS が決める）。**開閉の状態は1つ**（この hook が持つ）で、
// 押した先の DOM がどちらでも同じ一覧が開く。**「≡」とは同時に開かない**——広い画面には
// 「≡」が無く（CSS が消す）、狭い画面ではこの札そのものが「≡」の面の中にしか無いので、
// 「≡」を開かずにこの一覧だけを開く経路が無い（画面の形で担保されるので、状態の突き合わせは
// 要らない）。
//
// 閉じる合図（外側を押した・Esc）は「≡」と歯車と同じ `browser/hooks/use-dismiss-signal.ts` で
// 取る（**開いている間だけ `document` を購読する**）。**Esc のときだけ押した口へフォーカスを
// 戻す**のはこの札の事情なので、合図の種類を見てここで決める。**戻り先の札は
// コールバック ref で集める**（{@link ScreenNavCurrentWork.toggleRef}）。

import { useCallback, useRef, useState, type RefCallback, type RefObject } from "react"

import { type BackgroundTask, type BackgroundTaskKind } from "../../../../shared/background-task.ts"
import { type DiaryWriting } from "../../../../shared/diary.ts"
import { type PendingAsk } from "../../../../shared/pending-ask.ts"
import {
  currentTurnSteps,
  type TurnStep,
  type TurnStepList,
  type TurnStepStatus,
} from "../../../../shared/turn-step.ts"
import { DEFAULT_CHARACTER_NAME } from "../../../domain/portrait-appearance.ts"
import { useDismissSignal, type DismissCause } from "../../../hooks/use-dismiss-signal.ts"
import { summarizeToolInput, toolInputText } from "../../../lib/tool-summary.ts"
import { useQuestionScroll } from "../../../stores/question-scroll.tsx"
import { navigateTo, useScreen } from "../../../stores/screen.tsx"
import { useSessionSelector, useTurnRunning } from "../../../stores/session.tsx"
import { useTurnSelection } from "../../../stores/turn-selection.tsx"
import { monthDayLabel } from "../../../utils/month-day-label.ts"

/** 閉じている間に出す手順の件数（依頼の手順が6件以上あると「すべて見る」の口が出る）。 */
const MAX_COLLAPSED_STEPS = 5

/**
 * 5つの状態の語（上ほど強い。表の並びは docs/screen-design.md 13.9「いまの作業」）。
 * `background` は**ターンは終わっているが背景のタスクが動いている**とき（同「背景のタスク」）。
 * `diary` は**成果の振り返りで日記を書いている**とき（`docs/screen-design.md` 13.9「いまの作業」の
 * 表。`state.diaryWriting.kind === "writing"`）で、答え待ちの次・作業中の前に見る。
 */
export type ScreenNavCurrentWorkState =
  | "stopped"
  | "pending"
  | "diary"
  | "running"
  | "background"
  | "idle"

const WORK_WORD_LABEL = {
  stopped: "止まっている",
  pending: "答え待ち",
  diary: "振り返り中",
  running: "作業中",
  background: "背景で作業中",
  idle: "依頼待ち",
} satisfies Record<ScreenNavCurrentWorkState, string>

/** 背景のタスクの種類の語（docs/screen-design.md 13.9「背景のタスク」）。 */
const BACKGROUND_TASK_KIND_LABEL = {
  shell: "シェル",
  agent: "サブエージェント",
  other: "その他",
} satisfies Record<BackgroundTaskKind, string>

/** 一覧に出す手順1件（見た目が読める形まで畳んだもの）。 */
export type ScreenNavCurrentWorkStep = {
  readonly key: string
  readonly label: string
  readonly nested: boolean
  readonly status: TurnStepStatus
  readonly input: unknown
}

/**
 * 実行中の手順があるかどうかと、札の要約にも出すか（`pending` / `running` のときだけ）を
 * 1つの合併型で表す（docs/coding-standards.md「複数の「無い」が1つの状態」。「札に要約を
 * 出す条件」を型の外の boolean チェックにせず、値そのものに畳んである）。
 *
 * - `none`: 実行中の手順が無い
 * - `silent`: 実行中の手順はあるが、いまの状態の語では札に要約を出さない
 *   （`idle` / `background` / `stopped`。一覧を開けば「実行中の手順の全文」には出る）
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
 * 札に出す要約（`.screen-nav-work-summary`）。**答え待ちで先頭の答え待ちが質問なら、実行中の
 * 手順の要約より質問の要約を優先する**（`docs/screen-design.md` 13.9「いまの作業」。答え待ちは
 * ターンの途中で作業が止まっている状態で、利用者がいま向き合うべきものは質問のため）。
 * 許可要求の答え待ちはこれまでどおり実行中の手順の要約に従う。
 */
export type ScreenNavCurrentWorkSummary =
  | { readonly kind: "none" }
  | { readonly kind: "text"; readonly label: string }

/** 一覧に出す背景のタスク1件（見た目が読める形まで畳んだもの）。 */
export type ScreenNavCurrentWorkBackgroundTask = {
  readonly key: string
  /** 種類の語（「シェル」「サブエージェント」「その他」）。 */
  readonly kindLabel: string
  /** claude が添えた説明。無ければ空（行には種類の語だけが出る）。 */
  readonly description: string
}

/**
 * 一覧の「背景で動いているもの」の区画（docs/screen-design.md 13.9「背景のタスク」）。
 * **状態の語に関わらず、動いているものがあれば出す**（作業中・答え待ちでも、ターンの外に
 * 残るものがあると分かるように）。
 */
export type ScreenNavCurrentWorkBackgroundList =
  | { readonly kind: "none" }
  | {
      readonly kind: "tasks"
      readonly headingLabel: string
      readonly tasks: readonly ScreenNavCurrentWorkBackgroundTask[]
    }

/** 「手順をすべて見る」の口。6件以下なら出さない（`fixed`）。 */
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
      /** 閉じている間は新しい5件、開いていれば全件（{@link expanded}）。 */
      readonly steps: readonly ScreenNavCurrentWorkStep[]
      readonly expanded: boolean
      readonly onToggleExpanded: () => void
      readonly toggleAll: ScreenNavCurrentWorkToggleAll
    }

/**
 * 一覧の見出しに添える、答えの場所の案内（`docs/screen-design.md` 13.9「いまの作業」）。
 * 答え待ちのときだけ意味を持ち、**答え待ちの中身で行き先が変わる**ので判別可能な合併型にする
 * （docs/coding-standards.md「複数の「無い」が1つの状態」と同じ理由で、
 * boolean 1つには畳まない）:
 *
 * - `none`: 答え待ちでない
 * - `input`: 許可要求。今までどおり「。入力欄の上で答えられる」を添える
 * - `question`: 質問（メインビューの札で答える）。見出しの文面は変えず、
 *   一覧に「質問へ」の口を出す
 */
export type ScreenNavCurrentWorkPendingHint =
  | { readonly kind: "none" }
  | { readonly kind: "input" }
  | { readonly kind: "question"; readonly onGoToQuestion: () => void }

export type ScreenNavCurrentWork = {
  readonly state: ScreenNavCurrentWorkState
  readonly wordLabel: string
  /** 印（○ / ●）。依頼待ちは中抜きだが、**雑談中の依頼待ちだけ埋める**（{@link chatIdle}）。 */
  readonly mark: "○" | "●"
  /**
   * 雑談中の依頼待ちか（`docs/screen-design.md` 13.9「いまの作業」/ 13.7）。true のときだけ
   * `wordLabel` が「<名前> とおしゃべり中」になり、印と字の色が `--accent` に変わる
   * （`screen-nav.module.css` の `[data-chat-idle="true"]`）。
   */
  readonly chatIdle: boolean
  readonly pendingHint: ScreenNavCurrentWorkPendingHint
  /** 札の要約（{@link ScreenNavCurrentWorkSummary}）。答え待ちの質問はこれで実行中の手順を覆う。 */
  readonly summary: ScreenNavCurrentWorkSummary
  readonly runningStep: ScreenNavCurrentWorkRunningStep
  readonly backgroundList: ScreenNavCurrentWorkBackgroundList
  readonly stepList: ScreenNavCurrentWorkStepList
  readonly open: boolean
  readonly onToggle: () => void
  /**
   * 札の `<button>` を預ける口（Esc で閉じたときのフォーカスの戻り先）。**`RefObject` ではなく
   * コールバック ref** なのは、同じ札が広い画面の帯と「≡」の面の2箇所に描かれるため——
   * 入れ物を1つにすると後から付いたほうで上書きされ、面を閉じた時点で戻り先が空になる。
   * 付いている札を**全部**集めておき、Esc のときはその全部へ `.focus()` を呼ぶ
   * （見えていないほうは `display: none` で効かない）。
   */
  readonly toggleRef: RefCallback<HTMLButtonElement>
}

/** `navRef` は帯全体（`<nav>`）。外側を押したかの判定に使う（「≡」と同じ `ref`）。 */
export function useCurrentWork(navRef: RefObject<HTMLElement | null>): ScreenNavCurrentWork {
  const endedReason = useSessionSelector((session) => session.state.endedReason)
  const pending = useSessionSelector((session) => session.state.pending)
  const turnInProgress = useTurnRunning()
  const records = useSessionSelector((session) => session.state.records)
  const backgroundTasks = useSessionSelector((session) => session.state.backgroundTasks)
  const diaryWriting = useSessionSelector((session) => session.state.diaryWriting)
  const chatMode = useSessionSelector((session) => session.state.chatMode)
  const characterName = useSessionSelector((session) => session.state.character?.name)
  const screen = useScreen()
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  const { requestScroll } = useQuestionScroll()

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // いま DOM に付いている札（{@link ScreenNavCurrentWork.toggleRef}）。React の外にある資源を
  // 持つ可変の入れ物なので ref に置く（書き換えはコールバック ref = 取り付けのときだけ）。
  const toggleNodes = useRef(new Set<HTMLButtonElement>())

  const toggleRef = useCallback<RefCallback<HTMLButtonElement>>((node) => {
    // **cleanup を返す形なので React 19 は `null` で呼び直さない**（外れるのは下の cleanup）。
    // 型の上では `null` が来うるので、そのときは何も預からない。
    if (node === null) {
      return
    }
    const nodes = toggleNodes.current
    nodes.add(node)
    return () => {
      nodes.delete(node)
    }
  }, [])

  const onToggle = useCallback((): void => {
    setOpen((wasOpen) => !wasOpen)
    setExpanded(false)
  }, [])

  const onToggleExpanded = useCallback((): void => {
    setExpanded((wasExpanded) => !wasExpanded)
  }, [])

  const onDismiss = useCallback((cause: DismissCause): void => {
    setOpen(false)
    setExpanded(false)
    if (cause === "escape") {
      // 押せる状態にある札は1つだけ（もう片方は `display: none` で `.focus()` が効かない）
      // なので、付いているものへ順に呼んで構わない。
      for (const node of toggleNodes.current) {
        node.focus()
      }
    }
  }, [])

  useDismissSignal({ open, rootRef: navRef, onDismiss })

  // **質問へ**（`docs/screen-design.md` 13.9「いまの作業」）。一覧を閉じ、キャラクター/トークン消費の
  // 画面を見ていれば会話の画面へ戻し、過去のやり取りを見ていれば最新へ戻してから、メインビューの
  // 質問の札までスクロールさせる（`stores/question-scroll.tsx`）。
  const onGoToQuestion = useCallback((): void => {
    setOpen(false)
    setExpanded(false)
    if (screen !== "conversation") {
      navigateTo("conversation")
    }
    if (newestTurnId !== undefined && activeTurnId !== newestTurnId) {
      selectTurn(newestTurnId)
    }
    requestScroll()
  }, [screen, activeTurnId, newestTurnId, selectTurn, requestScroll])

  const sessionEnded = endedReason !== undefined
  const turnStepList = currentTurnSteps(records, sessionEnded)
  const firstPending = pending[0]

  const state: ScreenNavCurrentWorkState = sessionEnded
    ? "stopped"
    : firstPending !== undefined
      ? "pending"
      : diaryWriting.kind === "writing"
        ? "diary"
        : turnInProgress
          ? "running"
          : backgroundTasks.length > 0
            ? "background"
            : "idle"

  // **雑談中の依頼待ちだけ**「<名前> とおしゃべり中」に変える（`docs/screen-design.md` 13.9「いまの作業」。
  // 答え待ち・作業中・止まっているは、雑談中でもそのまま意味を持つ語なので変えない）。
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
    summary: toSummaryView(state, firstPending, runningStep, backgroundTasks, diaryWriting),
    runningStep,
    backgroundList: toBackgroundListView(backgroundTasks),
    stepList: toStepListView(turnStepList, { turnInProgress, expanded, onToggleExpanded }),
    open,
    onToggle,
    toggleRef,
  }
}

/**
 * {@link ScreenNavCurrentWorkRunningStep} を組み立てる。「札に要約も出すか」はここで決める。
 */
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

/**
 * {@link ScreenNavCurrentWorkSummary} を組み立てる。**答え待ちの先頭が質問なら、実行中の手順の
 * 要約より質問の要約を優先する**（docs/screen-design.md 13.9「いまの作業」）。許可要求の答え待ちは
 * 今までどおり実行中の手順の要約に従う。**背景で作業中なら、背景のタスクの要約を出す**
 * （同「背景のタスク」）。**振り返り中は「<日付>の日記を書いています」**（同）。
 */
function toSummaryView(
  state: ScreenNavCurrentWorkState,
  firstPending: PendingAsk | undefined,
  runningStep: ScreenNavCurrentWorkRunningStep,
  backgroundTasks: readonly BackgroundTask[],
  diaryWriting: DiaryWriting,
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
  return runningStep.kind === "shown"
    ? { kind: "text", label: runningStep.summaryLabel }
    : { kind: "none" }
}

/**
 * 質問の要約。**1問目の `header` をそのまま使う**（`AskUserQuestion` の入力の型
 * （`node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts`）で「最大12字」と決まっている
 * ので、`text` を切り詰める必要が無い）。**2問以上あれば「ほか n問」を添える**
 * （`shared/question.ts` の `parseQuestions` が返す質問は1〜4件）。
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
 * 背景のタスクの要約。**いちばん新しく始まったもの（並びの末尾）の説明**を出し、2件以上あれば
 * 「ほか n件」を添える（質問の要約の「ほか n問」と同じ形）。説明が無ければ種類の語で代える。
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

/** {@link ScreenNavCurrentWorkBackgroundList} を組み立てる。動いているものが無ければ `none`。 */
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

/**
 * {@link ScreenNavCurrentWorkPendingHint} を組み立てる。答え待ちでなければ `none`、
 * 許可要求なら今までどおり `input`、質問なら `question`（一覧に「質問へ」を出す）。
 */
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

/** {@link ScreenNavCurrentWorkStepList} を組み立てる。 */
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
    steps: visibleSteps.map(toStepView),
    expanded,
    onToggleExpanded,
    toggleAll: toToggleAllView(steps, expanded),
  }
}

/** {@link ScreenNavCurrentWorkToggleAll} を組み立てる。6件以下なら `fixed`。 */
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

function stepLabel(step: TurnStep): string {
  const summary = summarizeToolInput(step.name, step.input)
  return summary === "" ? step.name : `${step.name}: ${summary}`
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
