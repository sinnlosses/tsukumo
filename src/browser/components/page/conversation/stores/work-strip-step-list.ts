// 進み具合のプログレスバーの「手順 n」で開く依頼の手順の一覧が、どのやり取りで開いているか。
// 帯の外（失敗の表示）からも、失敗した手順を指して開けるよう、store に持つ。

import { create } from "zustand"

/**
 * 開いた一覧をどこへ連れていくか。`top` は「手順 n」の口で開いたときで、どこへも転がさない。
 * `failure` は最初の失敗の行。`signal` は連れていく合図で、同じ行を続けて指しても変わる。
 */
export type StepsLanding =
  | { readonly kind: "top" }
  | { readonly kind: "failure"; readonly signal: number }

/**
 * 開いている詳細。手順の一覧とフェーズの詳細は同時に1つだけ開くので、判別合併型の1つの値で持つ。
 * `exchange` は開いたときのやり取り（`MainViewContent` の `exchange`）で、やり取りが替わると閉じて見える。
 * `segmentKey` は押した下線の区間の `key`。
 */
type WorkStripStepsOpened =
  | { readonly kind: "closed" }
  | { readonly kind: "steps"; readonly exchange: number; readonly landing: StepsLanding }
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
}

const TOP = { kind: "top" } as const satisfies StepsLanding

export const useWorkStripSteps = create<WorkStripStepsState>()((set) => ({
  opened: { kind: "closed" },
  landingCount: 0,
  toggle: (exchange) => {
    set((state) => ({
      opened: isOpenFor(state.opened, exchange)
        ? { kind: "closed" }
        : { kind: "steps", exchange, landing: TOP },
    }))
  },
  openAtTop: (exchange) => {
    set({ opened: { kind: "steps", exchange, landing: TOP } })
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
}))

function landedState(
  state: WorkStripStepsState,
  exchange: number,
  landingOf: (signal: number) => StepsLanding,
): Pick<WorkStripStepsState, "opened" | "landingCount"> {
  const landingCount = state.landingCount + 1
  return { landingCount, opened: { kind: "steps", exchange, landing: landingOf(landingCount) } }
}

function isOpenFor(opened: WorkStripStepsOpened, exchange: number): boolean {
  return opened.kind === "steps" && opened.exchange === exchange
}
