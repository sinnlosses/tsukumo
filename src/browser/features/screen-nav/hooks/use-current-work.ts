// 帯のまん中の札「いまの作業」のロジック（docs/design.md 13.9「いまの作業」/ docs/glossary.md
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
// 閉じる合図（外側を押した・Esc）の購読は「≡」と同じ（`use-screen-nav.ts`）——**開いている間だけ
// `document` の `pointerdown` / `keydown` を `useEffect` で取る**
// （docs/coding-standards.md「React」の4類型のうち「外部システムの購読」）。

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import {
  currentTurnSteps,
  type TurnStep,
  type TurnStepList,
  type TurnStepStatus,
} from "../../../../shared/turn-step.ts"
import { summarizeToolInput, toolInputText } from "../../../lib/tool-summary.ts"
import { useSessionSelector } from "../../../stores/session.tsx"

/** 閉じている間に出す手順の件数（依頼の手順が6件以上あると「すべて見る」の口が出る）。 */
const MAX_COLLAPSED_STEPS = 5

/** 4つの状態の語（上ほど強い。表の並びは docs/design.md 13.9「いまの作業」）。 */
export type ScreenNavCurrentWorkState = "stopped" | "pending" | "running" | "idle"

const WORK_WORD_LABEL: Record<ScreenNavCurrentWorkState, string> = {
  stopped: "止まっている",
  pending: "答え待ち",
  running: "作業中",
  idle: "依頼待ち",
}

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
 *   （`idle` / `stopped`。一覧を開けば「実行中の手順の全文」には出る）
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

export type ScreenNavCurrentWork = {
  readonly state: ScreenNavCurrentWorkState
  readonly wordLabel: string
  /** 答え待ちのときだけ true（一覧の見出しに「入力欄の上で答えられる」を添える）。 */
  readonly pendingHint: boolean
  readonly runningStep: ScreenNavCurrentWorkRunningStep
  readonly stepList: ScreenNavCurrentWorkStepList
  readonly open: boolean
  readonly onToggle: () => void
}

export type UseCurrentWorkResult = {
  readonly view: ScreenNavCurrentWork
  /** 広い画面の帯にある札（`presentational-screen-nav.tsx`）。 */
  readonly toggleRefWide: RefObject<HTMLButtonElement | null>
  /** 狭い画面の「≡」の面の中にある札（`screen-nav-menu.tsx`）。 */
  readonly toggleRefNarrow: RefObject<HTMLButtonElement | null>
}

/** `navRef` は帯全体（`<nav>`）。外側を押したかの判定に使う（「≡」と同じ `ref`）。 */
export function useCurrentWork(navRef: RefObject<HTMLElement | null>): UseCurrentWorkResult {
  const endedReason = useSessionSelector((session) => session.state.endedReason)
  const pendingCount = useSessionSelector((session) => session.state.pending.length)
  const turnInProgress = useSessionSelector((session) => session.state.turn.kind === "running")
  const records = useSessionSelector((session) => session.state.records)

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const toggleRefWide = useRef<HTMLButtonElement>(null)
  const toggleRefNarrow = useRef<HTMLButtonElement>(null)

  const onToggle = useCallback((): void => {
    setOpen((wasOpen) => !wasOpen)
    setExpanded(false)
  }, [])

  const onToggleExpanded = useCallback((): void => {
    setExpanded((wasExpanded) => !wasExpanded)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    function closeOnOutside(event: PointerEvent): void {
      const root = navRef.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false)
        setExpanded(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false)
        setExpanded(false)
        // どちらか一方しか押せる状態にない（もう片方は `display: none` で `.focus()` が
        // 効かない）ので、両方へ呼んで構わない。
        toggleRefWide.current?.focus()
        toggleRefNarrow.current?.focus()
      }
    }

    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open, navRef])

  const sessionEnded = endedReason !== undefined
  const turnStepList = currentTurnSteps(records, sessionEnded)

  const state: ScreenNavCurrentWorkState = sessionEnded
    ? "stopped"
    : pendingCount > 0
      ? "pending"
      : turnInProgress
        ? "running"
        : "idle"

  return {
    view: {
      state,
      wordLabel: WORK_WORD_LABEL[state],
      pendingHint: state === "pending",
      runningStep: toRunningStepView(turnStepList, state),
      stepList: toStepListView(turnStepList, { turnInProgress, expanded, onToggleExpanded }),
      open,
      onToggle,
    },
    toggleRefWide,
    toggleRefNarrow,
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
