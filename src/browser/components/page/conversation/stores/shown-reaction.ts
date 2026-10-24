// 吹き出しに出す反応（`shownReaction`）を、中身が同じなら同じ参照で返す場所。
//
// 導出は姿・先頭の札・いまの時刻から毎回やり直すが、結果の中身が直前と等しければ直前のものを返す。
// 姿の参照がイベントごとに替わっても、反応が変わらなければ購読している部品を描き直さない。

import { replaceEqualDeep } from "@tanstack/react-query"

import type { WelcomeHead } from "../../../../../shared/recommendation/welcome-greeting.ts"
import {
  shownReaction,
  type ShownReaction,
  waitingLineDueAt,
} from "../../../../../shared/session/shown-reaction.ts"
import { useSession } from "../../../../stores/session.ts"

let latest: ShownReaction = { kind: "none" }

/** 待ちの一言を出し始める時刻（`waitingLineDueAt`）。数なので、姿が替わっても同じなら描き直さない。 */
export function useWaitingLineDueAt(): number | undefined {
  return useSession((session) => waitingLineDueAt(session.state))
}

export function useShownReaction(head: WelcomeHead, now: number): ShownReaction {
  return useSession((session) => {
    latest = replaceEqualDeep(latest, shownReaction(session.state, head, now))
    return latest
  })
}
