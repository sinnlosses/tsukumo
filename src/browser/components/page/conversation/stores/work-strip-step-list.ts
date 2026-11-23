// 進み具合のプログレスバーの「手順 n」で開く依頼の手順の一覧が、どのやり取りで開いているか。
// 帯の外（失敗の表示）からも、失敗した手順を指して開けるよう、store に持つ。

import { create } from "zustand"

import type { TaskId } from "../../../../../shared/session-driver/task-id.ts"

/**
 * 開いた一覧をどこへ連れていくか。`top` は「手順 n」の口で開いたときで、どこへも転がさない。
 * `failure` は最初の失敗の行。`signal` は連れていく合図で、同じ行を続けて指しても変わる。
 */
export type StepsLanding =
  | { readonly kind: "top" }
  | { readonly kind: "failure"; readonly signal: number }

/** ワークフローの図で押した箱。`index` はエージェントの鍵。 */
export type SelectedWorkflowAgent =
  | { readonly kind: "none" }
  | { readonly kind: "agent"; readonly taskId: TaskId; readonly index: number }

/**
 * 開いている詳細。手順の一覧とフェーズの詳細は同時に1つだけ開くので、判別合併型の1つの値で持つ。
 * `exchange` は開いたときのやり取り（`MainViewContent` の `exchange`）で、やり取りが替わると閉じて見える。
 * `segmentKey` は押した下線の区間の `key`。
 */
type WorkStripStepsOpened =
  | { readonly kind: "closed" }
  | {
      readonly kind: "steps"
      readonly exchange: number
      readonly landing: StepsLanding
      /** 畳んだ「済んだ n フェーズ」を開いたか。閉じると値ごと消える。 */
      readonly doneExpanded: boolean
      /** 今のフェーズの手順を全部開いたか。 */
      readonly stepsExpanded: boolean
      /** ワークフローの図の「済んだ n フェーズ」を開いたか。 */
      readonly workflowPhasesUnfolded: boolean
      /** ワークフローの図で「ほか n 件」を開いた列の鍵。 */
      readonly unfoldedWorkflowColumns: readonly string[]
      /** 畳んだ見出しから開いたワークフロースクリプト。いちばん新しいものは載せなくても開いている。 */
      readonly openedWorkflowRuns: readonly TaskId[]
      readonly selectedWorkflowAgent: SelectedWorkflowAgent
    }
  | { readonly kind: "phase"; readonly exchange: number; readonly segmentKey: string }

type WorkStripStepsState = {
  readonly opened: WorkStripStepsOpened
  /** 行や段を指して開いた回数。合図を押すたびに変えるために数える。 */
  readonly landingCount: number
  /** 「手順 n」の口。そのやり取りで開いていれば閉じ、そうでなければ開く。 */
  readonly toggle: (exchange: number) => void
  /** 先頭を指して開く（開いていても閉じない）。 */
  readonly openAtTop: (exchange: number) => void
  /** 失敗した手順を指して開く。 */
  readonly openAtFailure: (exchange: number) => void
  /** 下線の区間を押したとき。同じ区間の詳細が開いていれば閉じ、そうでなければ開く（手順の一覧は閉じる）。 */
  readonly togglePhase: (exchange: number, segmentKey: string) => void
  /** フェーズの詳細を閉じる。手順の一覧は触らない。 */
  readonly closePhase: () => void
  /** 全体の詳細だけを閉じる。フェーズの詳細は触らない。 */
  readonly closeSteps: () => void
  /** 畳んだ「済んだ n フェーズ」を開く。 */
  readonly expandDone: (exchange: number) => void
  /** 今のフェーズの手順を全部開く。 */
  readonly expandSteps: (exchange: number) => void
  /** ワークフローの図の「済んだ n フェーズ」を開く。 */
  readonly unfoldWorkflowPhases: (exchange: number) => void
  /** 開いたワークフローの図を、「済んだ n フェーズ」を畳んだ形へ戻す。 */
  readonly foldWorkflowPhases: (exchange: number) => void
  /** ワークフローの図の列の「ほか n 件」を開く。 */
  readonly unfoldWorkflowColumn: (exchange: number, column: string) => void
  /** 畳んだワークフロースクリプトを開く。 */
  readonly openWorkflowRun: (exchange: number, taskId: TaskId) => void
  /** ワークフローの図の箱を選ぶ。 */
  readonly selectWorkflowAgent: (exchange: number, taskId: TaskId, index: number) => void
}

const TOP = { kind: "top" } as const satisfies StepsLanding

function stepsOpenedOf(exchange: number, landing: StepsLanding): WorkStripStepsOpened {
  return {
    kind: "steps",
    exchange,
    landing,
    doneExpanded: false,
    stepsExpanded: false,
    workflowPhasesUnfolded: false,
    unfoldedWorkflowColumns: [],
    openedWorkflowRuns: [],
    selectedWorkflowAgent: { kind: "none" },
  }
}

export const useWorkStripSteps = create<WorkStripStepsState>()((set) => ({
  opened: { kind: "closed" },
  landingCount: 0,
  toggle: (exchange) => {
    set((state) => ({
      opened: isOpenFor(state.opened, exchange) ? { kind: "closed" } : stepsOpenedOf(exchange, TOP),
    }))
  },
  openAtTop: (exchange) => {
    set({ opened: stepsOpenedOf(exchange, TOP) })
  },
  openAtFailure: (exchange) => {
    set((state) => landedState(state, exchange, (signal) => ({ kind: "failure", signal })))
  },
  togglePhase: (exchange, segmentKey) => {
    set((state) => ({
      opened:
        state.opened.kind === "phase" &&
        state.opened.exchange === exchange &&
        state.opened.segmentKey === segmentKey
          ? { kind: "closed" }
          : { kind: "phase", exchange, segmentKey },
    }))
  },
  closePhase: () => {
    set((state) => (state.opened.kind === "phase" ? { opened: { kind: "closed" } } : state))
  },
  closeSteps: () => {
    set((state) => (state.opened.kind === "steps" ? { opened: { kind: "closed" } } : state))
  },
  expandDone: (exchange) => {
    set((state) => withSteps(state, exchange, () => ({ doneExpanded: true })))
  },
  expandSteps: (exchange) => {
    set((state) => withSteps(state, exchange, () => ({ stepsExpanded: true })))
  },
  unfoldWorkflowPhases: (exchange) => {
    set((state) => withSteps(state, exchange, () => ({ workflowPhasesUnfolded: true })))
  },
  foldWorkflowPhases: (exchange) => {
    set((state) => withSteps(state, exchange, () => ({ workflowPhasesUnfolded: false })))
  },
  unfoldWorkflowColumn: (exchange, column) => {
    set((state) =>
      withSteps(state, exchange, (steps) => ({
        unfoldedWorkflowColumns: [...steps.unfoldedWorkflowColumns, column],
      })),
    )
  },
  openWorkflowRun: (exchange, taskId) => {
    set((state) =>
      withSteps(state, exchange, (steps) => ({
        openedWorkflowRuns: [...steps.openedWorkflowRuns, taskId],
      })),
    )
  },
  selectWorkflowAgent: (exchange, taskId, index) => {
    set((state) =>
      withSteps(state, exchange, () => ({
        selectedWorkflowAgent: { kind: "agent", taskId, index },
      })),
    )
  },
}))

type OpenedSteps = Extract<WorkStripStepsOpened, { readonly kind: "steps" }>

/** そのやり取りで手順の一覧が開いているときだけ書き、ほかはそのまま返す。 */
function withSteps(
  state: WorkStripStepsState,
  exchange: number,
  update: (steps: OpenedSteps) => Partial<Omit<OpenedSteps, "kind" | "exchange">>,
): WorkStripStepsState | Pick<WorkStripStepsState, "opened"> {
  return state.opened.kind === "steps" && state.opened.exchange === exchange
    ? { opened: { ...state.opened, ...update(state.opened) } }
    : state
}

function landedState(
  state: WorkStripStepsState,
  exchange: number,
  landingOf: (signal: number) => StepsLanding,
): Pick<WorkStripStepsState, "opened" | "landingCount"> {
  const landingCount = state.landingCount + 1
  return { landingCount, opened: stepsOpenedOf(exchange, landingOf(landingCount)) }
}

function isOpenFor(opened: WorkStripStepsOpened, exchange: number): boolean {
  return opened.kind === "steps" && opened.exchange === exchange
}
