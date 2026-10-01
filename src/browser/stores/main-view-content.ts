// メインビューにいま出している中身（`MainViewContent`）と、読んでいるあいだの保留。
//
// 中身は姿1つからは導けない（閉じた瞬間に保留していたかで、地図のまま残すかが決まる）。
// そのため `useSession` の姿が変わるたびに、前の中身から次の中身へ進める。

import { create } from "zustand"

import { conversationMoment, isExchangeClosed } from "../../shared/session/conversation-moment.ts"
import type { MainViewTurn } from "../../shared/session/main-view.ts"
import type { SessionState } from "../../shared/session/session-state.ts"
import { mainViewTurnsOf } from "./main-view-turn.ts"
import { useSession } from "./session.ts"

/**
 * 出している中身。
 * `exchange` はそのやり取りを始めたときの `SessionState.nextTurnId`（依頼で進み、続きのターンでは進まない）。
 * `work-map` の `held` は、保留しているあいだに閉じたので、閉じる直前のターン（`frozen`）を出し続けている形。
 * `report` の `arrived` は、このページで地図から入れ替えたか（読み込んだ時点で閉じていたなら false）。
 */
export type MainViewContent =
  | { readonly kind: "welcome" }
  | { readonly kind: "work-map"; readonly exchange: number; readonly hold: WorkMapHold }
  | { readonly kind: "report"; readonly exchange: number; readonly arrived: boolean }

export type WorkMapHold =
  | { readonly kind: "live" }
  | { readonly kind: "held"; readonly frozen: MainViewTurn }

/** 保留の理由。どちらかが立っているあいだは、閉じても入れ替えない。 */
export type MainViewHoldReason = "focus" | "scroll"

export type MainViewContentState = {
  readonly content: MainViewContent
  readonly hold: Readonly<Record<MainViewHoldReason, boolean>>
  readonly setHold: (reason: MainViewHoldReason, on: boolean) => void
  /** 保留して地図のまま残したやり取りを、レポートへ入れ替える。 */
  readonly acceptHeldReport: () => void
}

export const useMainViewContent = create<MainViewContentState>()((set, get) => {
  useSession.subscribe((next, previous) => {
    if (next.state === previous.state) {
      return
    }
    const { content, hold } = get()
    const advanced = advanceContent(content, previous.state, next.state, hold.focus || hold.scroll)
    if (advanced !== content) {
      set({ content: advanced })
    }
  })
  return {
    content: freshContent(useSession.getState().state),
    hold: { focus: false, scroll: false },
    setHold: (reason, on) => {
      if (get().hold[reason] !== on) {
        set((current) => ({ hold: { ...current.hold, [reason]: on } }))
      }
    },
    acceptHeldReport: () => {
      const { content } = get()
      if (content.kind === "work-map" && content.hold.kind === "held") {
        set({ content: { kind: "report", exchange: content.exchange, arrived: true } })
      }
    },
  }
})

function advanceContent(
  content: MainViewContent,
  previous: SessionState,
  next: SessionState,
  held: boolean,
): MainViewContent {
  if (conversationMoment(next) === "greet") {
    return content.kind === "welcome" ? content : { kind: "welcome" }
  }
  if (content.kind === "welcome" || content.exchange !== next.nextTurnId) {
    return freshContent(next)
  }
  if (content.kind === "work-map" && content.hold.kind === "live" && isExchangeClosed(next)) {
    const frozen = mainViewTurnsOf(previous).at(-1)
    return held && frozen !== undefined
      ? { ...content, hold: { kind: "held", frozen } }
      : { kind: "report", exchange: content.exchange, arrived: true }
  }
  return content
}

/** 閉じる瞬間を見ていない姿から中身を決める。 */
function freshContent(state: SessionState): MainViewContent {
  if (conversationMoment(state) === "greet") {
    return { kind: "welcome" }
  }
  return isExchangeClosed(state)
    ? { kind: "report", exchange: state.nextTurnId, arrived: false }
    : { kind: "work-map", exchange: state.nextTurnId, hold: { kind: "live" } }
}
