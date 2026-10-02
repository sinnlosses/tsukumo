// メインビューにいま出している中身（`MainViewContent`）。
//
// 中身は姿1つからは導けない（送った・閉じたの遷移でしか変わらない）。
// そのため `useSession` の姿が変わるたびに、前の中身から次の中身へ進める。

import { create } from "zustand"

import { conversationMoment, isExchangeClosed } from "../../shared/session/conversation-moment.ts"
import type { SessionState } from "../../shared/session/session-state.ts"
import { useSession } from "./session.ts"

/**
 * 出している中身。
 * `exchange` はそのやり取りを始めたときの `SessionState.nextTurnId`（依頼で進み、続きのターンでは進まない）。
 * `report` の `arrived` は、このページで地図から入れ替えたか（読み込んだ時点で閉じていたなら false）。
 */
export type MainViewContent =
  | { readonly kind: "welcome" }
  | { readonly kind: "work-map"; readonly exchange: number }
  | { readonly kind: "report"; readonly exchange: number; readonly arrived: boolean }

export type MainViewContentState = {
  readonly content: MainViewContent
}

export const useMainViewContent = create<MainViewContentState>()((set, get) => {
  useSession.subscribe((next, previous) => {
    if (next.state === previous.state) {
      return
    }
    const { content } = get()
    const advanced = advanceContent(content, next.state)
    if (advanced !== content) {
      set({ content: advanced })
    }
  })
  return {
    content: freshContent(useSession.getState().state),
  }
})

function advanceContent(content: MainViewContent, next: SessionState): MainViewContent {
  if (conversationMoment(next) === "greet") {
    return content.kind === "welcome" ? content : { kind: "welcome" }
  }
  if (content.kind === "welcome" || content.exchange !== next.nextTurnId) {
    return freshContent(next)
  }
  if (content.kind === "work-map" && isExchangeClosed(next)) {
    return { kind: "report", exchange: content.exchange, arrived: true }
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
    : { kind: "work-map", exchange: state.nextTurnId }
}
