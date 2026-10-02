// 進み具合の帯の「手順 n」で開く依頼の手順の一覧が、どのやり取りで開いているか。
// 帯の外（失敗の塊）からも、失敗した手順を指して開けるよう、store に持つ。

import { create } from "zustand"

/**
 * 一覧の開き具合。`exchange` は開いたときのやり取り（`MainViewContent` の `exchange`）で、やり取りが替わると閉じて見える。
 * `failureSignal` は失敗した手順を指して開いた合図で、0 は「手順 n」の口で開いたとき。
 */
export type WorkStripStepsOpened =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly exchange: number; readonly failureSignal: number }

export type WorkStripStepsState = {
  readonly opened: WorkStripStepsOpened
  /** 失敗した手順を指して開いた回数。合図を押すたびに変えるために数える。 */
  readonly failureCount: number
  /** 「手順 n」の口。そのやり取りで開いていれば閉じ、そうでなければ開く。 */
  readonly toggle: (exchange: number) => void
  /** 失敗した手順を指して開く。 */
  readonly openAtFailure: (exchange: number) => void
}

export const useWorkStripSteps = create<WorkStripStepsState>()((set) => ({
  opened: { kind: "closed" },
  failureCount: 0,
  toggle: (exchange) => {
    set((state) => ({
      opened: isOpenFor(state.opened, exchange)
        ? { kind: "closed" }
        : { kind: "open", exchange, failureSignal: 0 },
    }))
  },
  openAtFailure: (exchange) => {
    set((state) => {
      const failureCount = state.failureCount + 1
      return { failureCount, opened: { kind: "open", exchange, failureSignal: failureCount } }
    })
  },
}))

function isOpenFor(opened: WorkStripStepsOpened, exchange: number): boolean {
  return opened.kind === "open" && opened.exchange === exchange
}
