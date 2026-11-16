// サイドシート（サイドバーの左に開く、タスク1件の詳細）で開いているタスク。
// サイドバーの行（開いている印）と、会話の画面のサイドシートの置き場の両方が読む。

import { create } from "zustand"

/**
 * 開いている面の種類。`open` はタスク1件の詳細、`sort` はドラフトの全件を分類する場面。
 * `previousId` はつながり・本文中の ID で飛んだときだけ持つ、パンくずの「戻る」先（直前の1つだけ）。
 */
export type TaskSheetSubject =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly id: string; readonly previousId?: string }
  | { readonly kind: "sort" }

type TaskSheetState = {
  readonly sheet: TaskSheetSubject
  /** サイドバーが出している行の ID を、画面の上からの順で。前後の口と ↑↓ の移り先。 */
  readonly order: readonly string[]
  /**
   * つながり・本文中の ID・パンくずで詳細を切り替えるたびに増える。
   * 押した要素は詳細の作り直しで消えてフォーカスが落ちるので、サイドシートの器へ戻す合図にする。
   */
  readonly focusSignal: number
  readonly open: (id: string) => void
  /** 開いている同じタスクなら閉じ、ほかは開く。 */
  readonly toggle: (id: string) => void
  /** ドラフトの分類の場面を開く。すでに開いていれば閉じる。 */
  readonly toggleSort: () => void
  /** `order` の隣へ移る。端と、開いているタスクが `order` に無いときは動かない。 */
  readonly step: (delta: 1 | -1) => void
  readonly jump: (id: string) => void
  readonly back: () => void
  readonly close: () => void
  readonly setOrder: (ids: readonly string[]) => void
}

export const useTaskSheet = create<TaskSheetState>()((set, get) => ({
  sheet: { kind: "closed" },
  order: [],
  focusSignal: 0,
  open: (id) => {
    set({ sheet: { kind: "open", id } })
  },
  toggle: (id) => {
    const { sheet } = get()
    set({
      sheet: sheet.kind === "open" && sheet.id === id ? { kind: "closed" } : { kind: "open", id },
    })
  },
  toggleSort: () => {
    const { sheet } = get()
    set({ sheet: sheet.kind === "sort" ? { kind: "closed" } : { kind: "sort" } })
  },
  step: (delta) => {
    const { sheet, order } = get()
    if (sheet.kind !== "open") {
      return
    }
    const index = order.indexOf(sheet.id)
    const next = index === -1 ? undefined : order[index + delta]
    if (next !== undefined) {
      set({ sheet: { kind: "open", id: next } })
    }
  },
  jump: (id) => {
    const { sheet, focusSignal } = get()
    if (sheet.kind !== "open" || sheet.id === id) {
      return
    }
    set({ sheet: { kind: "open", id, previousId: sheet.id }, focusSignal: focusSignal + 1 })
  },
  back: () => {
    const { sheet, focusSignal } = get()
    if (sheet.kind !== "open" || sheet.previousId === undefined) {
      return
    }
    set({ sheet: { kind: "open", id: sheet.previousId }, focusSignal: focusSignal + 1 })
  },
  close: () => {
    set({ sheet: { kind: "closed" } })
  },
  setOrder: (ids) => {
    set({ order: ids })
  },
}))
