// 進み具合の帯の「手順 n」で開く依頼の手順の一覧が、どのやり取りで開いているか。
// 帯の外（失敗の塊）からも、失敗した手順を指して開けるよう、store に持つ。

import { create } from "zustand"

/**
 * 開いた一覧をどこへ連れていくか。`top` は「手順 n」の口で開いたときで、どこへも転がさない。
 * `failure` は最初の失敗の行、`phase` は段（平らにした並びでの位置 `phaseIndex`）の区切り。
 * `signal` は連れていく合図で、同じ行・同じ段を続けて指しても変わる。
 */
export type StepsLanding =
  | { readonly kind: "top" }
  | { readonly kind: "failure"; readonly signal: number }
  | { readonly kind: "phase"; readonly phaseIndex: number; readonly signal: number }

/** 一覧の開き具合。`exchange` は開いたときのやり取り（`MainViewContent` の `exchange`）で、やり取りが替わると閉じて見える。 */
export type WorkStripStepsOpened =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly exchange: number; readonly landing: StepsLanding }

export type WorkStripStepsState = {
  readonly opened: WorkStripStepsOpened
  /** 行や段を指して開いた回数。合図を押すたびに変えるために数える。 */
  readonly landingCount: number
  /** 「手順 n」の口。そのやり取りで開いていれば閉じ、そうでなければ開く。 */
  readonly toggle: (exchange: number) => void
  /** 失敗した手順を指して開く。 */
  readonly openAtFailure: (exchange: number) => void
  /** 段の区切りを指して開く（開いていれば開いたまま転がす）。 */
  readonly openAtPhase: (exchange: number, phaseIndex: number) => void
}

const TOP = { kind: "top" } as const satisfies StepsLanding

export const useWorkStripSteps = create<WorkStripStepsState>()((set) => ({
  opened: { kind: "closed" },
  landingCount: 0,
  toggle: (exchange) => {
    set((state) => ({
      opened: isOpenFor(state.opened, exchange)
        ? { kind: "closed" }
        : { kind: "open", exchange, landing: TOP },
    }))
  },
  openAtFailure: (exchange) => {
    set((state) => landedState(state, exchange, (signal) => ({ kind: "failure", signal })))
  },
  openAtPhase: (exchange, phaseIndex) => {
    set((state) =>
      landedState(state, exchange, (signal) => ({ kind: "phase", phaseIndex, signal })),
    )
  },
}))

function landedState(
  state: WorkStripStepsState,
  exchange: number,
  landingOf: (signal: number) => StepsLanding,
): Pick<WorkStripStepsState, "opened" | "landingCount"> {
  const landingCount = state.landingCount + 1
  return { landingCount, opened: { kind: "open", exchange, landing: landingOf(landingCount) } }
}

function isOpenFor(opened: WorkStripStepsOpened, exchange: number): boolean {
  return opened.kind === "open" && opened.exchange === exchange
}
