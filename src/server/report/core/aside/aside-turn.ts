// 補足メッセージ（`aside`）のターンかの畳み込み。`report` の関所（`createReportGate`）と差し戻し（`ReportReview`）が同じ決まりで読む。

import type { SessionEvent } from "../../../../shared/session/session-event.ts"

/**
 * `running` はターンが走っているか。`aside` はいまのターンが補足メッセージのターンか。
 * `pending` は、走っているターンに届いた `aside` が答えを待っているか。
 */
export type AsideTurnState = {
  readonly running: boolean
  readonly aside: boolean
  readonly pending: boolean
  /** 直前の `report` の締めのセリフがまだ届いていない。その `speech` は保留への答えではない。 */
  readonly closingNext: boolean
}

export const INITIAL_ASIDE_TURN: AsideTurnState = {
  running: false,
  aside: false,
  pending: false,
  closingNext: false,
}

/**
 * ターンが走っていないときに届いた `aside` は、そのターンを補足メッセージのターンにする。
 * 走っているときに届いたものは保留にし、走っているターンは補足メッセージのターンにしない（作業のターンの差し戻しを外さない）。
 * 保留は、最初の `speech`（走っているターンが取り込んで答えた。`report` の締めのセリフは数えない）か、次の依頼・ターンの始まりで外す。
 * 保留のままターンが終わり、次のターンが `turn-resumed` で始まったら、そのターンを補足メッセージのターンにする。
 * ターンの頭の `session-info` は補足メッセージのターンの頭にも届くので、状態を動かさない。
 */
export function nextAsideTurn(state: AsideTurnState, event: SessionEvent): AsideTurnState {
  switch (event.kind) {
    case "aside":
      return state.running
        ? { ...state, pending: true }
        : { ...INITIAL_ASIDE_TURN, running: true, aside: true }
    case "request":
    case "turn-started":
      return { ...INITIAL_ASIDE_TURN, running: true }
    case "turn-resumed":
      return { ...INITIAL_ASIDE_TURN, running: true, aside: state.pending }
    case "turn-finished":
      return { ...INITIAL_ASIDE_TURN, pending: state.pending }
    case "report":
      return { ...state, closingNext: event.closing.kind === "speech" }
    case "speech":
      if (state.closingNext) {
        return { ...state, closingNext: false }
      }
      return state.pending ? { ...state, pending: false } : state
    default:
      return state
  }
}
